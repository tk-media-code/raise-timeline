package com.tkmedia.raisetimeline.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.ConflictException;
import com.tkmedia.raisetimeline.error.ErrorCode;
import com.tkmedia.raisetimeline.error.InvalidCredentialsException;
import com.tkmedia.raisetimeline.error.InvalidRefreshTokenException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.service.AuthResult;
import com.tkmedia.raisetimeline.service.AuthService;
import jakarta.servlet.http.Cookie;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(controllers = AuthController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline",
		"auth.refresh-token-ttl=P30D",
		"auth.cookie-name=refresh_token",
		"auth.cookie-secure=false" })
class AuthControllerTest {

	// jwtDecoder が存在確認に使う。本物のトークンを送るテストは existsById を true にスタブする。
	@MockitoBean
	private UserMapper userMapper;

	private static final String PROBLEM_JSON = "application/problem+json";
	private static final String RAW_REFRESH = "raw-refresh-token-value";
	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final AuthResult RESULT = new AuthResult("access-token-value", RAW_REFRESH,
			new Me(USER_ID, "taro_1", "太郎", null, "", false, 0, 0, OffsetDateTime.parse("2026-10-01T00:00:00Z"),
					true, "taro@example.com"));
	private static final String NO_NUL_MESSAGE = "使えない文字が含まれています";
	private static final String USERNAME_MESSAGE = "3〜20 文字の英数字と _ で入力してください";

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private AuthService authService;

	@BeforeEach
	void stubService() {
		when(authService.register(any())).thenReturn(RESULT);
		when(authService.login(any())).thenReturn(RESULT);
		when(authService.refresh(any())).thenReturn(RESULT);
	}

	@Nested
	@DisplayName("Cookie の Secure 属性は auth.cookie-secure に従う")
	@TestPropertySource(properties = "auth.cookie-secure=true")
	class SecureCookie {

		@Test
		@DisplayName("auth.cookie-secure=true なら Secure が付く")
		void secureIsSetWhenEnabled() throws Exception {
			postJson("/api/auth/register", registerJson("taro_1", "太郎", "taro@example.com", "password1"))
					.andExpect(status().isCreated())
					.andExpect(header().string("Set-Cookie", containsString("; Secure")));
		}

		@Test
		@DisplayName("auth.cookie-secure=true のとき、消す Cookie にも Secure が付く")
		void secureIsSetOnClearingCookie() throws Exception {
			mockMvc.perform(post("/api/auth/logout"))
					.andExpect(status().isNoContent())
					.andExpect(header().string("Set-Cookie", containsString("; Secure")));
		}

	}

	@Test
	@DisplayName("登録は 201 で、本文にアクセストークンと本人の情報を返し、リフレッシュトークンは Cookie で返す")
	void registerReturns201WithCookie() throws Exception {
		postJson("/api/auth/register", registerJson("taro_1", "太郎", "taro@example.com", "password1"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.accessToken").value("access-token-value"))
				.andExpect(jsonPath("$.user.isMe").value(true))
				.andExpect(jsonPath("$.user.email").value("taro@example.com"))
				.andExpect(jsonPath("$.refreshToken").doesNotExist())
				.andExpect(header().string("Set-Cookie", startsWith("refresh_token=" + RAW_REFRESH + ";")))
				.andExpect(header().string("Set-Cookie", containsString("HttpOnly")))
				.andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
				.andExpect(header().string("Set-Cookie", containsString("Path=/api/auth")))
				.andExpect(header().string("Set-Cookie", containsString("Max-Age=2592000")))
				.andExpect(header().string("Set-Cookie", not(containsString("Secure"))));
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("acceptedRegistrations")
	@DisplayName("登録の入力の境界: 通る値")
	void registerValidationAccepts(String name, String username, String displayName, String email, String password)
			throws Exception {
		postJson("/api/auth/register", registerJson(username, displayName, email, password))
				.andExpect(status().isCreated());
	}

	static Stream<Arguments> acceptedRegistrations() {
		return Stream.of(
				Arguments.of("username 3 文字", "abc", "太郎", "a@example.com", "password1"),
				Arguments.of("username 20 文字", "a".repeat(20), "太郎", "a@example.com", "password1"),
				Arguments.of("displayName 50 文字", "taro_1", "あ".repeat(50), "a@example.com", "password1"),
				Arguments.of("displayName 絵文字 1 つは 1 文字", "taro_1", "😀", "a@example.com", "password1"),
				Arguments.of("displayName 絵文字 50 個は 50 文字", "taro_1", "😀".repeat(50), "a@example.com", "password1"),
				Arguments.of("email 254 文字", "taro_1", "太郎", longEmail(254), "password1"),
				Arguments.of("email 254 コードポイント（絵文字を含み UTF-16 では 255 以上）", "taro_1", "太郎",
						"😀".repeat(2) + longEmail(252), "password1"),
				Arguments.of("email のローカル部が連続するドット", "taro_1", "太郎", "a..b@example.com", "password1"),
				Arguments.of("email のローカル部が 65 文字", "taro_1", "太郎", "a".repeat(65) + "@example.com", "password1"),
				Arguments.of("password 8 文字", "taro_1", "太郎", "a@example.com", "a".repeat(8)),
				Arguments.of("password 72 文字", "taro_1", "太郎", "a@example.com", "a".repeat(72)));
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("rejectedRegistrations")
	@DisplayName("登録の入力の境界: 422 になる値")
	void registerValidationRejects(String name, String field, String username, String displayName, String email,
			String password) throws Exception {
		postJson("/api/auth/register", registerJson(username, displayName, email, password))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value(field));
	}

	static Stream<Arguments> rejectedRegistrations() {
		return Stream.of(
				Arguments.of("username 2 文字", "username", "ab", "太郎", "a@example.com", "password1"),
				Arguments.of("username 21 文字", "username", "a".repeat(21), "太郎", "a@example.com", "password1"),
				Arguments.of("username にハイフン", "username", "a-b", "太郎", "a@example.com", "password1"),
				Arguments.of("username が日本語", "username", "あいう", "太郎", "a@example.com", "password1"),
				Arguments.of("displayName が空白だけ", "displayName", "taro_1", "   ", "a@example.com", "password1"),
				Arguments.of("displayName が全角空白だけ", "displayName", "taro_1", "　　", "a@example.com",
						"password1"),
				Arguments.of("displayName 51 文字", "displayName", "taro_1", "あ".repeat(51), "a@example.com",
						"password1"),
				Arguments.of("displayName 絵文字 51 個は 51 文字", "displayName", "taro_1", "😀".repeat(51), "a@example.com",
						"password1"),
				Arguments.of("email に @ が無い", "email", "taro_1", "太郎", "example.com", "password1"),
				Arguments.of("email の @ の後が無い", "email", "taro_1", "太郎", "alice@", "password1"),
				Arguments.of("email の @ の前が無い", "email", "taro_1", "太郎", "@example.com", "password1"),
				Arguments.of("email のローカル部に空白", "email", "taro_1", "太郎", "a b@example.com", "password1"),
				Arguments.of("email のドメインに空白", "email", "taro_1", "太郎", "alice@exa mple.com", "password1"),
				Arguments.of("email 255 文字", "email", "taro_1", "太郎", longEmail(255), "password1"),
				Arguments.of("email 255 コードポイント（絵文字を含む）", "email", "taro_1", "太郎",
						"😀".repeat(2) + longEmail(253), "password1"),
				Arguments.of("password 7 文字", "password", "taro_1", "太郎", "a@example.com", "a".repeat(7)),
				Arguments.of("password 73 文字", "password", "taro_1", "太郎", "a@example.com", "a".repeat(73)));
	}

	@Test
	@DisplayName("同じ項目の同じ文言は 1 件にまとめる（空の username は @NotBlank と @Pattern の両方に当たる）")
	void sameErrorIsNotRepeated() throws Exception {
		postJson("/api/auth/register", registerJson("", "太郎", "a@example.com", "password1"))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.errors", hasSize(1)))
				.andExpect(jsonPath("$.errors[0].field").value("username"))
				.andExpect(jsonPath("$.errors[0].message").value(USERNAME_MESSAGE));
	}

	@ParameterizedTest
	@ValueSource(strings = { "pass word1", "ｐａｓｓｗｏｒｄ１" })
	@DisplayName("パスワードの空白と全角文字は 422 になる")
	void passwordWithSpaceOrFullWidthIsRejected(String password) throws Exception {
		postJson("/api/auth/register", registerJson("taro_1", "太郎", "a@example.com", password))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.errors[0].field").value("password"));
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("nulInEachStringField")
	@DisplayName("どの文字列項目でも、途中や末尾の NUL（JSON のエスケープ）は空白の除去より前の値で検出して 422 になる")
	void nulInStringFieldIsRejected(String name, String path, String field, String json) throws Exception {
		// username と password は @Pattern にも当たるので、エラーが 1 件とは限らない。NoNul の文言が入っていることを見る。
		postJson(path, json)
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[?(@.field == '" + field + "')].message").value(hasItem(NO_NUL_MESSAGE)));
	}

	static Stream<Arguments> nulInEachStringField() {
		String nul = "\\u0000";
		List<Arguments> cases = new ArrayList<>();
		String[][] registerFields = { { "username", "taro_1" }, { "displayName", "太郎です" },
				{ "email", "a@example.com" }, { "password", "password1" } };
		for (String[] f : registerFields) {
			for (String[] position : new String[][] { { "途中", f[1].substring(0, 2) + nul + f[1].substring(2) },
					{ "末尾", f[1] + nul } }) {
				Map<String, String> values = new LinkedHashMap<>();
				for (String[] other : registerFields) {
					values.put(other[0], other[0].equals(f[0]) ? position[1] : other[1]);
				}
				cases.add(Arguments.of("登録の " + f[0] + " の" + position[0], "/api/auth/register", f[0],
						registerJson(values.get("username"), values.get("displayName"), values.get("email"),
								values.get("password"))));
			}
		}
		cases.add(Arguments.of("ログインの email の途中", "/api/auth/login", "email",
				loginJson("a" + nul + "@example.com", "password1")));
		cases.add(Arguments.of("ログインの email の末尾", "/api/auth/login", "email",
				loginJson("a@example.com" + nul, "password1")));
		cases.add(Arguments.of("ログインの password の途中", "/api/auth/login", "password",
				loginJson("a@example.com", "pass" + nul + "word1")));
		cases.add(Arguments.of("ログインの password の末尾", "/api/auth/login", "password",
				loginJson("a@example.com", "password1" + nul)));
		return cases.stream();
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("loneSurrogateInEachStringField")
	@DisplayName("どの文字列項目でも、対になっていないサロゲートは 422 になる")
	void loneSurrogateInStringFieldIsRejected(String name, String path, String field, String json) throws Exception {
		// username と password は @Pattern にも当たるので、エラーが 1 件とは限らない。NoNul の文言が入っていることを見る。
		postJson(path, json)
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[?(@.field == '" + field + "')].message").value(hasItem(NO_NUL_MESSAGE)));
	}

	static Stream<Arguments> loneSurrogateInEachStringField() {
		String lone = "\\uD800";
		List<Arguments> cases = new ArrayList<>();
		String[][] registerFields = { { "username", "taro_1" }, { "displayName", "太郎です" },
				{ "email", "a@example.com" }, { "password", "password1" } };
		for (String[] f : registerFields) {
			for (String[] position : new String[][] { { "途中", f[1].substring(0, 2) + lone + f[1].substring(2) },
					{ "単独", lone } }) {
				Map<String, String> values = new LinkedHashMap<>();
				for (String[] other : registerFields) {
					values.put(other[0], other[0].equals(f[0]) ? position[1] : other[1]);
				}
				cases.add(Arguments.of("登録の " + f[0] + " の" + position[0], "/api/auth/register", f[0],
						registerJson(values.get("username"), values.get("displayName"), values.get("email"),
								values.get("password"))));
			}
		}
		cases.add(Arguments.of("ログインの email の途中", "/api/auth/login", "email",
				loginJson("a" + lone + "@example.com", "password1")));
		cases.add(Arguments.of("ログインの email の単独", "/api/auth/login", "email",
				loginJson(lone, "password1")));
		cases.add(Arguments.of("ログインの password の途中", "/api/auth/login", "password",
				loginJson("a@example.com", "pass" + lone + "word1")));
		cases.add(Arguments.of("ログインの password の単独", "/api/auth/login", "password",
				loginJson("a@example.com", lone)));
		return cases.stream();
	}

	@Test
	@DisplayName("本文に生の NUL のバイトがあると、Jackson が拒んで 400 になる")
	void rawNulByteReturns400() throws Exception {
		postJson("/api/auth/register", registerJson("taro_1", "a\u0000b", "a@example.com", "password1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));
	}

	@Test
	@DisplayName("知らない項目が付いていても無視して 201 になる")
	void unknownFieldIsIgnored() throws Exception {
		postJson("/api/auth/register", """
				{"username":"taro_1","displayName":"太郎","email":"a@example.com","password":"password1","extra":1}""")
				.andExpect(status().isCreated());
	}

	@Test
	@DisplayName("ユーザー名の重複は 409 で、errors に項目名が入り、Cookie は付かない")
	void registerConflictReturns409WithField() throws Exception {
		when(authService.register(any())).thenThrow(new ConflictException(ErrorCode.USERNAME_TAKEN, "username"));

		postJson("/api/auth/register", registerJson("taro_1", "太郎", "a@example.com", "password1"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("USERNAME_TAKEN"))
				.andExpect(jsonPath("$.errors[0].field").value("username"))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	@DisplayName("ログインは 200 で、アクセストークンを本文に、リフレッシュトークンを Cookie に返す")
	void loginReturns200() throws Exception {
		postJson("/api/auth/login", loginJson("taro@example.com", "password1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").value("access-token-value"))
				.andExpect(jsonPath("$.user.email").value("taro@example.com"))
				.andExpect(header().string("Set-Cookie", startsWith("refresh_token=" + RAW_REFRESH + ";")));
	}

	@Test
	@DisplayName("ログインの失敗は 401 で、メールアドレスとパスワードのどちらが違うかを言わない固定の文言になり、Cookie は付かない")
	void loginInvalidReturns401WithFixedMessage() throws Exception {
		when(authService.login(any())).thenThrow(new InvalidCredentialsException());

		postJson("/api/auth/login", loginJson("taro@example.com", "wrong-password"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
				.andExpect(jsonPath("$.detail").value("メールアドレスまたはパスワードが違います"))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	@DisplayName("ログイン中に DB へ届かないときは 500 の固定文になり、接続先の情報を本文に載せず、Cookie は付かない")
	void loginWhenDatabaseUnreachableReturns500WithoutLeak() throws Exception {
		when(authService.login(any())).thenThrow(new CannotGetJdbcConnectionException(
				"Failed to obtain JDBC Connection: jdbc:postgresql://db:5432/raise_timeline に接続できない"));

		postJson("/api/auth/login", loginJson("taro@example.com", "password1"))
				.andExpect(status().isInternalServerError())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andExpect(jsonPath("$.detail").value(ErrorCode.INTERNAL_ERROR.message()))
				.andExpect(content().string(not(containsStringIgnoringCase("jdbc"))))
				.andExpect(content().string(not(containsStringIgnoringCase("postgresql"))))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	@DisplayName("ログインの入力が空なら 422 になり、サービスは呼ばれない")
	void loginEmptyFieldsReturn422() throws Exception {
		postJson("/api/auth/login", loginJson("", ""))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors", hasSize(2)));
		verifyNoInteractions(authService);
	}

	@Test
	@DisplayName("Cookie 無しの更新は null をサービスに渡し、サービスが拒むと 401 で、Cookie には触れない")
	void refreshWithoutCookieReturns401AndKeepsCookie() throws Exception {
		when(authService.refresh(null)).thenThrow(new InvalidRefreshTokenException());

		mockMvc.perform(post("/api/auth/refresh"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"))
				.andExpect(header().doesNotExist("Set-Cookie"));

		verify(authService).refresh(null);
	}

	@Test
	@DisplayName("更新は Cookie の値をサービスに渡し、200 で新しいアクセストークンと新しい Cookie を返す")
	void refreshReturnsNewCookie() throws Exception {
		when(authService.refresh("old-raw")).thenReturn(RESULT);

		mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie("refresh_token", "old-raw")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").value("access-token-value"))
				.andExpect(header().string("Set-Cookie", startsWith("refresh_token=" + RAW_REFRESH + ";")))
				.andExpect(header().string("Set-Cookie", containsString("Max-Age=2592000")));

		verify(authService).refresh("old-raw");
	}

	@Test
	@DisplayName("Cookie があって更新が失敗したとき、401 で、Cookie を消さない（Set-Cookie を付けない）")
	void refreshFailureDoesNotSetCookie() throws Exception {
		when(authService.refresh("old-raw")).thenThrow(new InvalidRefreshTokenException());

		mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie("refresh_token", "old-raw")))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	@DisplayName("ログアウトは Cookie の値をサービスに渡し、204 で同じ属性の空の Cookie を Max-Age=0 で返す")
	void logoutReturns204AndClearsCookie() throws Exception {
		mockMvc.perform(post("/api/auth/logout").cookie(new Cookie("refresh_token", "old-raw")))
				.andExpect(status().isNoContent())
				.andExpect(header().string("Set-Cookie", startsWith("refresh_token=;")))
				.andExpect(header().string("Set-Cookie", containsString("Max-Age=0")))
				.andExpect(header().string("Set-Cookie", containsString("HttpOnly")))
				.andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
				.andExpect(header().string("Set-Cookie", containsString("Path=/api/auth")));

		verify(authService).logout("old-raw");
	}

	@Test
	@DisplayName("Cookie 無しのログアウトも 204 で Cookie を消し、サービスには null を渡す（記録はサービスが書く）")
	void logoutWithoutCookieStillReturns204() throws Exception {
		mockMvc.perform(post("/api/auth/logout"))
				.andExpect(status().isNoContent())
				.andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));

		verify(authService).logout(null);
	}

	@ParameterizedTest
	@ValueSource(strings = { "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout" })
	@DisplayName("認証の API は Bearer が無くても到達できる")
	void authEndpointsDoNotRequireBearer(String path) throws Exception {
		MockHttpServletRequestBuilder request = post(path).contentType(MediaType.APPLICATION_JSON)
				.content(path.endsWith("login")
						? loginJson("taro@example.com", "password1")
						: registerJson("taro_1", "太郎", "a@example.com", "password1"));

		mockMvc.perform(request)
				.andExpect(status().is2xxSuccessful());
	}

	private ResultActions postJson(String path, String json) throws Exception {
		return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	/** 文字列は呼び出し側が JSON のエスケープ済みの値を渡す（NUL のエスケープを送るテストがあるため、ここでは加工しない）。 */
	private static String registerJson(String username, String displayName, String email, String password) {
		return """
				{"username":"%s","displayName":"%s","email":"%s","password":"%s"}"""
				.formatted(username, displayName, email, password);
	}

	private static String loginJson(String email, String password) {
		return """
				{"email":"%s","password":"%s"}""".formatted(email, password);
	}

	/**
	 * 全体の長さがちょうど length コードポイントの、画面と同じ規則（空白と @ を含まない 2 部分を @ でつなぐ）で形式として正しいメールアドレス。
	 * ローカル部を伸ばして長さを作る。画面の規則はローカル部の長さを見ないので、64 文字を超えても通る。
	 */
	private static String longEmail(int length) {
		String domain = "@example.com";
		return "a".repeat(length - domain.length()) + domain;
	}

}
