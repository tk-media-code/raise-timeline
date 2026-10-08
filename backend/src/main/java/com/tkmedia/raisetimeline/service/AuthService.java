package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.config.AuthProperties;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.dto.LoginRequest;
import com.tkmedia.raisetimeline.dto.RegisterRequest;
import com.tkmedia.raisetimeline.error.ConflictException;
import com.tkmedia.raisetimeline.error.ErrorCode;
import com.tkmedia.raisetimeline.error.InvalidCredentialsException;
import com.tkmedia.raisetimeline.error.InvalidRefreshTokenException;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.mapper.RefreshTokenMapper;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 登録・ログイン・更新・ログアウト。トークンを Cookie やヘッダーに載せるのは Controller の仕事で、
 * ここは生のトークンを返すだけ。
 *
 * <p>ログには利用者 id を {@code MDC} で渡し、メールアドレス・パスワード・トークンは書かない。
 */
@Service
public class AuthService {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);

	/** 一意索引の名前（db/ の定義と合わせる）。競合のとき、どの項目が重なったかをこれで見分ける。 */
	private static final String USERNAME_INDEX = "users_username_lower_key";
	private static final String EMAIL_INDEX = "users_email_lower_key";

	private final UserMapper userMapper;
	private final RefreshTokenMapper refreshTokenMapper;
	private final TokenService tokenService;
	private final PasswordEncoder passwordEncoder;
	private final UserService userService;
	private final AuthProperties props;
	private final Clock clock;

	/**
	 * 未登録のメールでログインされたときも BCrypt の照合を 1 回走らせるための、ダミーのハッシュ。
	 * 照合を省くと「未登録は速く、登録済みで不一致は遅い」という応答時間の差から、登録の有無が分かってしまう。
	 * BCrypt の計算は遅いので、要求ごとにではなく起動時に 1 度だけ作る。
	 */
	private final String dummyHash;

	public AuthService(UserMapper userMapper, RefreshTokenMapper refreshTokenMapper, TokenService tokenService,
			PasswordEncoder passwordEncoder, UserService userService, AuthProperties props, Clock clock) {
		this.userMapper = userMapper;
		this.refreshTokenMapper = refreshTokenMapper;
		this.tokenService = tokenService;
		this.passwordEncoder = passwordEncoder;
		this.userService = userService;
		this.props = props;
		this.clock = clock;
		this.dummyHash = passwordEncoder.encode("dummy-password-for-timing");
	}

	@Transactional
	public AuthResult register(RegisterRequest request) {
		// 1 回の応答で返す重複は 1 件だけなので、ユーザー名 → メールの順に確かめて、最初の 1 件で止める。
		if (userMapper.existsByUsername(request.username())) {
			throw new ConflictException(ErrorCode.USERNAME_TAKEN, "username");
		}
		if (userMapper.existsByEmail(request.email())) {
			throw new ConflictException(ErrorCode.EMAIL_TAKEN, "email");
		}
		OffsetDateTime now = OffsetDateTime.now(clock);
		User toInsert = new User(null, request.username(), request.displayName(), request.email(),
				passwordEncoder.encode(request.password()), "", null, now, now);
		UUID id;
		try {
			id = userMapper.insert(toInsert);
		} catch (DuplicateKeyException e) {
			// 確認と insert の間に別の登録が入った場合。例外の文言には重なった値（メール）が入るので、
			// ログにも新しい例外にも引き継がない。
			throw translate(e);
		}
		User saved = new User(id, toInsert.username(), toInsert.displayName(), toInsert.email(),
				toInsert.passwordHash(), toInsert.bio(), toInsert.avatarKey(), now, now);
		AuthResult result = issue(saved, now);
		MDC.put(LogFields.USER_ID, id.toString());
		log.atInfo().addKeyValue(LogFields.EVENT_ACTION, LogEvents.AUTH_REGISTER).log("登録した");
		return result;
	}

	@Transactional
	public AuthResult login(LoginRequest request) {
		User user = userMapper.findByEmail(request.email()).orElse(null);
		// 利用者の有無に関わらず照合を 1 回走らせる（dummyHash の説明を参照）。
		String hash = user != null ? user.passwordHash() : dummyHash;
		boolean matches = passwordEncoder.matches(request.password(), hash);
		if (user == null || !matches) {
			// 利用者 id もメールの有無も書かない。
			log.atInfo().addKeyValue(LogFields.EVENT_ACTION, LogEvents.AUTH_LOGIN_FAILED).log("ログインに失敗した");
			throw new InvalidCredentialsException();
		}
		AuthResult result = issue(user, OffsetDateTime.now(clock));
		MDC.put(LogFields.USER_ID, user.id().toString());
		log.atInfo().addKeyValue(LogFields.EVENT_ACTION, LogEvents.AUTH_LOGIN_SUCCEEDED).log("ログインした");
		return result;
	}

	/**
	 * リフレッシュトークンを使い切り、新しいトークンに差し替える。使えるのは 1 回だけで、
	 * 同じトークンの 2 度目は {@code consume} が何も消さず、失敗になる。
	 */
	@Transactional
	public AuthResult refresh(String rawRefreshToken) {
		OffsetDateTime now = OffsetDateTime.now(clock);
		UUID userId = refreshTokenMapper.consume(tokenService.hashRefreshToken(rawRefreshToken), now);
		if (userId == null) {
			log.atInfo().addKeyValue(LogFields.EVENT_ACTION, LogEvents.AUTH_REFRESH_FAILED)
					.log("ログインの更新に失敗した");
			throw new InvalidRefreshTokenException();
		}
		// 期限切れの行は誰も使えないので、更新のついでにその人の分だけ掃除する。
		refreshTokenMapper.deleteExpiredByUserId(userId, now);
		String newRaw = tokenService.newRefreshToken();
		refreshTokenMapper.insert(userId, tokenService.hashRefreshToken(newRaw), now.plus(props.refreshTokenTtl()));
		return new AuthResult(tokenService.issueAccessToken(userId), newRaw, userService.getMe(userId));
	}

	@Transactional
	public void logout(String rawRefreshToken) {
		UUID userId = rawRefreshToken == null ? null
				: refreshTokenMapper.deleteByTokenHash(tokenService.hashRefreshToken(rawRefreshToken));
		if (userId != null) {
			MDC.put(LogFields.USER_ID, userId.toString());
		}
		log.atInfo().addKeyValue(LogFields.EVENT_ACTION, LogEvents.AUTH_LOGOUT).log("ログアウトした");
	}

	/** トークンを発行して、リフレッシュトークンのハッシュを保存する。 */
	private AuthResult issue(User user, OffsetDateTime now) {
		String refreshToken = tokenService.newRefreshToken();
		refreshTokenMapper.insert(user.id(), tokenService.hashRefreshToken(refreshToken),
				now.plus(props.refreshTokenTtl()));
		return new AuthResult(tokenService.issueAccessToken(user.id()), refreshToken, userService.toMe(user));
	}

	private static RuntimeException translate(DuplicateKeyException e) {
		String message = e.getMostSpecificCause().getMessage();
		if (message != null && message.contains(USERNAME_INDEX)) {
			return new ConflictException(ErrorCode.USERNAME_TAKEN, "username");
		}
		if (message != null && message.contains(EMAIL_INDEX)) {
			return new ConflictException(ErrorCode.EMAIL_TAKEN, "email");
		}
		return e;
	}

}
