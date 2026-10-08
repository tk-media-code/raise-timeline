package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.config.AuthProperties;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.LoginRequest;
import com.tkmedia.raisetimeline.dto.RegisterRequest;
import com.tkmedia.raisetimeline.error.ConflictException;
import com.tkmedia.raisetimeline.error.ErrorCode;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.InvalidCredentialsException;
import com.tkmedia.raisetimeline.error.InvalidRefreshTokenException;
import com.tkmedia.raisetimeline.mapper.RefreshTokenMapper;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {

	private static final Instant NOW = Instant.parse("2026-10-07T00:00:00Z");
	private static final OffsetDateTime NOW_ODT = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final String PASSWORD = "password123";
	private static final String EMAIL = "alice@example.com";
	private static final SecureRandom RANDOM = new SecureRandom();

	private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
	private final UserMapper userMapper = mock(UserMapper.class);
	private final RefreshTokenMapper refreshTokenMapper = mock(RefreshTokenMapper.class);
	// コストを下げた実物。ハッシュの形（$2 で始まる）と照合の結果を本物の BCrypt で確かめつつ、テストを速くする。
	private final PasswordEncoder passwordEncoder = spy(new BCryptPasswordEncoder(4));
	private final TokenService tokenService = tokenService();
	private final UserService userService = new UserService(userMapper);
	private final AuthService service = new AuthService(userMapper, refreshTokenMapper, tokenService, passwordEncoder,
			userService, properties(), clock);

	private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
	private final Logger authLogger = (Logger) LoggerFactory.getLogger(AuthService.class);

	@BeforeEach
	void captureLogs() {
		appender.start();
		authLogger.addAppender(appender);
	}

	@AfterEach
	void clearLogsAndMdc() {
		authLogger.detachAppender(appender);
		MDC.clear();
	}

	@Test
	@DisplayName("登録は BCrypt のハッシュを保存し、トークンを発行して、リフレッシュトークンはハッシュで残す")
	void registerStoresBcryptHashAndIssuesTokens() {
		when(userMapper.insert(any(User.class))).thenReturn(USER_ID);

		AuthResult result = service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD));

		ArgumentCaptor<User> user = ArgumentCaptor.forClass(User.class);
		verify(userMapper).insert(user.capture());
		assertThat(user.getValue().passwordHash()).startsWith("$2").isNotEqualTo(PASSWORD);
		assertThat(user.getValue().bio()).isEmpty();
		assertThat(user.getValue().avatarKey()).isNull();
		assertThat(user.getValue().createdAt()).isEqualTo(NOW_ODT);
		assertThat(user.getValue().updatedAt()).isEqualTo(NOW_ODT);
		ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
		verify(refreshTokenMapper).insert(eq(USER_ID), hash.capture(),
				eq(NOW_ODT.plus(Duration.ofDays(30))));
		assertThat(hash.getValue()).matches("^[0-9a-f]{64}$");
		assertThat(hash.getValue()).isEqualTo(tokenService.hashRefreshToken(result.refreshToken()));
		assertThat(result.accessToken()).isNotBlank();
		assertThat(result.me().id()).isEqualTo(USER_ID);
		assertThat(result.me().isMe()).isTrue();
		assertThat(result.me().email()).isEqualTo(EMAIL);
	}

	@Test
	@DisplayName("登録で使われているユーザー名なら、insert の前に USERNAME_TAKEN の ConflictException にする")
	void registerRejectsDuplicateUsernameBeforeInsert() {
		when(userMapper.existsByUsername("alice")).thenReturn(true);

		assertThatThrownBy(() -> service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD)))
				.isInstanceOfSatisfying(ConflictException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.USERNAME_TAKEN);
					assertThat(e.errors()).containsExactly(
							new FieldError("username", "このユーザー名は使われています"));
				});
		verify(userMapper, never()).insert(any());
		verify(refreshTokenMapper, never()).insert(any(), anyString(), any());
	}

	@Test
	@DisplayName("登録で使われているメールアドレスなら、insert の前に EMAIL_TAKEN の ConflictException にする")
	void registerRejectsDuplicateEmailBeforeInsert() {
		when(userMapper.existsByEmail(EMAIL)).thenReturn(true);

		assertThatThrownBy(() -> service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD)))
				.isInstanceOfSatisfying(ConflictException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.EMAIL_TAKEN);
					assertThat(e.errors()).containsExactly(
							new FieldError("email", "このメールアドレスは登録済みです"));
				});
		verify(userMapper, never()).insert(any());
	}

	@Test
	@DisplayName("ユーザー名もメールも重なるときは、ユーザー名だけを 1 件返す")
	void registerReportsUsernameFirstWhenBothTaken() {
		when(userMapper.existsByUsername("alice")).thenReturn(true);
		when(userMapper.existsByEmail(EMAIL)).thenReturn(true);

		assertThatThrownBy(() -> service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD)))
				.isInstanceOfSatisfying(ConflictException.class,
						e -> assertThat(e.code()).isEqualTo(ErrorCode.USERNAME_TAKEN));
	}

	@Test
	@DisplayName("確認と insert の間の競合は、一意制約の名前で振り分けて ConflictException にする")
	void registerTranslatesRaceOnUniqueIndex() {
		when(userMapper.insert(any(User.class)))
				.thenThrow(new DuplicateKeyException("... users_email_lower_key ..."));

		assertThatThrownBy(() -> service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD)))
				.isInstanceOfSatisfying(ConflictException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.EMAIL_TAKEN);
					assertThat(e.getMessage()).doesNotContain(EMAIL);
				});
	}

	@Test
	@DisplayName("ユーザー名の一意制約の競合は USERNAME_TAKEN にする")
	void registerTranslatesRaceOnUsernameIndex() {
		when(userMapper.insert(any(User.class)))
				.thenThrow(new DuplicateKeyException("... users_username_lower_key ..."));

		assertThatThrownBy(() -> service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD)))
				.isInstanceOfSatisfying(ConflictException.class,
						e -> assertThat(e.code()).isEqualTo(ErrorCode.USERNAME_TAKEN));
	}

	@Test
	@DisplayName("知らない制約名の DuplicateKeyException は、そのまま投げ直す")
	void registerRethrowsUnknownDuplicateKey() {
		DuplicateKeyException original = new DuplicateKeyException("... other_key ...");
		when(userMapper.insert(any(User.class))).thenThrow(original);

		assertThatThrownBy(() -> service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD)))
				.isSameAs(original);
	}

	@Test
	@DisplayName("登録の出来事は event.action だけを足し、user.id は MDC から付き、メールとパスワードは載らない")
	void registerLogsEventWithoutSecrets() {
		when(userMapper.insert(any(User.class))).thenReturn(USER_ID);

		service.register(new RegisterRequest("alice", "アリス", EMAIL, PASSWORD));

		List<ILoggingEvent> lines = eventsOf("auth.register");
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getKeyValuePairs()).hasSize(1);
		assertThat(lines.get(0).getFormattedMessage()).isEqualTo("登録した");
		assertThat(lines.get(0).getMDCPropertyMap().get("user.id")).isEqualTo(USER_ID.toString());
		assertThat(allLogText()).doesNotContain(EMAIL).doesNotContain(PASSWORD);
	}

	@Test
	@DisplayName("パスワードが合えば、トークンを発行して Me を返す")
	void loginReturnsTokensOnMatch() {
		User stored = storedUser();
		when(userMapper.findByEmail(EMAIL)).thenReturn(Optional.of(stored));

		AuthResult result = service.login(new LoginRequest(EMAIL, PASSWORD));

		assertThat(result.accessToken()).isNotBlank();
		assertThat(result.refreshToken()).isNotBlank();
		assertThat(result.me().id()).isEqualTo(USER_ID);
		assertThat(result.me().isMe()).isTrue();
		verify(refreshTokenMapper).insert(eq(USER_ID),
				eq(tokenService.hashRefreshToken(result.refreshToken())),
				eq(NOW_ODT.plus(Duration.ofDays(30))));
		List<ILoggingEvent> lines = eventsOf("auth.login.succeeded");
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getMDCPropertyMap().get("user.id")).isEqualTo(USER_ID.toString());
	}

	@Test
	@DisplayName("パスワードが違えば InvalidCredentialsException を投げ、利用者 id を付けずに記録する")
	void loginRejectsWrongPassword() {
		User stored = storedUser();
		when(userMapper.findByEmail(EMAIL)).thenReturn(Optional.of(stored));

		assertThatThrownBy(() -> service.login(new LoginRequest(EMAIL, "wrong-password")))
				.isInstanceOf(InvalidCredentialsException.class);

		verify(refreshTokenMapper, never()).insert(any(), anyString(), any());
		List<ILoggingEvent> lines = eventsOf("auth.login.failed");
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getFormattedMessage()).isEqualTo("ログインに失敗した");
		assertThat(lines.get(0).getMDCPropertyMap().get("user.id")).isNull();
		assertThat(allLogText()).doesNotContain(EMAIL).doesNotContain("wrong-password");
	}

	@Test
	@DisplayName("メールが未登録でもダミーのハッシュと照合してから InvalidCredentialsException を投げる")
	void loginUsesDummyHashWhenEmailUnknown() {
		when(userMapper.findByEmail(EMAIL)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.login(new LoginRequest(EMAIL, PASSWORD)))
				.isInstanceOf(InvalidCredentialsException.class);

		verify(passwordEncoder, times(1)).matches(eq(PASSWORD), anyString());
	}

	@Test
	@DisplayName("更新は使い切ったトークンの代わりに新しいトークンを入れ、期限切れを掃除する")
	void refreshRotatesToken() {
		String oldRaw = tokenService.newRefreshToken();
		String oldHash = tokenService.hashRefreshToken(oldRaw);
		when(refreshTokenMapper.consume(oldHash, NOW_ODT)).thenReturn(USER_ID);
		User stored = storedUser();
		when(userMapper.findById(USER_ID)).thenReturn(Optional.of(stored));

		AuthResult result = service.refresh(oldRaw);

		assertThat(result.refreshToken()).isNotEqualTo(oldRaw);
		assertThat(result.accessToken()).isNotBlank();
		assertThat(result.me().id()).isEqualTo(USER_ID);
		verify(refreshTokenMapper).deleteExpiredByUserId(USER_ID, NOW_ODT);
		verify(refreshTokenMapper).insert(eq(USER_ID),
				eq(tokenService.hashRefreshToken(result.refreshToken())),
				eq(NOW_ODT.plus(Duration.ofDays(30))));
	}

	@Test
	@DisplayName("知らない・使用済み・期限切れのトークンは InvalidRefreshTokenException にして記録する")
	void refreshRejectsUnknownToken() {
		when(refreshTokenMapper.consume(anyString(), any())).thenReturn(null);

		assertThatThrownBy(() -> service.refresh("unknown-token"))
				.isInstanceOf(InvalidRefreshTokenException.class);

		verify(refreshTokenMapper, never()).insert(any(), anyString(), any());
		verify(refreshTokenMapper, never()).deleteExpiredByUserId(any(), any());
		List<ILoggingEvent> lines = eventsOf("auth.refresh.failed");
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getFormattedMessage()).isEqualTo("ログインの更新に失敗した");
		assertThat(allLogText()).doesNotContain("unknown-token");
	}

	@Test
	@DisplayName("ログアウトはトークンのハッシュで行を消し、持ち主が分かれば user.id を付けて記録する")
	void logoutDeletesByHash() {
		String raw = tokenService.newRefreshToken();
		when(refreshTokenMapper.deleteByTokenHash(tokenService.hashRefreshToken(raw))).thenReturn(USER_ID);

		service.logout(raw);

		verify(refreshTokenMapper).deleteByTokenHash(tokenService.hashRefreshToken(raw));
		List<ILoggingEvent> lines = eventsOf("auth.logout");
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getFormattedMessage()).isEqualTo("ログアウトした");
		assertThat(lines.get(0).getMDCPropertyMap().get("user.id")).isEqualTo(USER_ID.toString());
		assertThat(allLogText()).doesNotContain(raw);
	}

	@Test
	@DisplayName("ログアウトは持ち主が分からなくても例外にせず、user.id なしで記録する")
	void logoutWithUnknownTokenStillLogs() {
		when(refreshTokenMapper.deleteByTokenHash(anyString())).thenReturn(null);

		service.logout("unknown-token");

		List<ILoggingEvent> lines = eventsOf("auth.logout");
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getMDCPropertyMap().get("user.id")).isNull();
	}

	/** event.action が一致する行。行に足した項目はキーと値の組で持たれている。 */
	private List<ILoggingEvent> eventsOf(String action) {
		return appender.list.stream()
				.filter(e -> e.getKeyValuePairs() != null && e.getKeyValuePairs().stream()
						.anyMatch(kv -> "event.action".equals(kv.key) && action.equals(kv.value)))
				.toList();
	}

	/** 行のメッセージ・項目・MDC を 1 つの文字列にして、載せてはいけない値が無いことの確認に使う。 */
	private String allLogText() {
		return appender.list.stream()
				.map(e -> e.getFormattedMessage() + e.getKeyValuePairs() + e.getMDCPropertyMap())
				.reduce("", String::concat);
	}

	private User storedUser() {
		return new User(USER_ID, "alice", "アリス", EMAIL, passwordEncoder.encode(PASSWORD), "", null, NOW_ODT,
				NOW_ODT);
	}

	private static TokenService tokenService() {
		byte[] key = new byte[32];
		RANDOM.nextBytes(key);
		AuthProperties props = properties(key);
		return new TokenService(SecurityConfig.createJwtEncoder(key), props, Clock.fixed(NOW, ZoneOffset.UTC));
	}

	private static AuthProperties properties() {
		byte[] key = new byte[32];
		RANDOM.nextBytes(key);
		return properties(key);
	}

	private static AuthProperties properties(byte[] key) {
		return new AuthProperties(Base64.getEncoder().encodeToString(key), Duration.ofHours(1), Duration.ofDays(30),
				"refresh_token", true, "raise-timeline");
	}

}
