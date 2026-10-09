package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.logging.LogLines;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 登録からログアウトまでの流れを、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>{@code @Transactional} は付けない。同時実行のテストは別スレッドから要求を送るので、
 * テストのトランザクションの中に閉じ込めると、別スレッドの書き込みが見えなくなる。その代わり、
 * 各テストが作った利用者を {@link #cleanUp()} で消す（リフレッシュトークンは外部キーの連鎖で消える）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class AuthFlowIntegrationTest {

	private static final String COOKIE_NAME = "refresh_token";
	private static final String PASSWORD = "Passw0rd!secret";
	private static final long TIMEOUT_SECONDS = 30;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	/** このテストが作った（作ろうとした）利用者名。後片付けでこの名前の行だけを消す。 */
	private final List<String> usernames = new ArrayList<>();

	@AfterEach
	void cleanUp() {
		for (String username : usernames) {
			jdbc.update("DELETE FROM users WHERE lower(username) = lower(?)", username);
		}
	}

	/** ユーザー名は 20 文字以内なので、UUID の先頭 8 文字だけを使う。 */
	private String newName(String prefix) {
		String name = prefix + "_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(name);
		return name;
	}

	private MvcResult register(String username, String email, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content(json(Map.of("username", username, "displayName", "テスト", "email", email,
						"password", password))))
				.andReturn();
	}

	private MvcResult login(String email, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content(json(Map.of("email", email, "password", password))))
				.andReturn();
	}

	private MvcResult refresh(String cookieValue, String bearer) throws Exception {
		var request = post("/api/auth/refresh");
		if (cookieValue != null) {
			request.cookie(new Cookie(COOKIE_NAME, cookieValue));
		}
		if (bearer != null) {
			request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
		}
		return mockMvc.perform(request).andReturn();
	}

	private MvcResult logout(String cookieValue, String bearer) throws Exception {
		var request = post("/api/auth/logout");
		if (cookieValue != null) {
			request.cookie(new Cookie(COOKIE_NAME, cookieValue));
		}
		if (bearer != null) {
			request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
		}
		return mockMvc.perform(request).andReturn();
	}

	/** JSON の文字列に入れる値は、このテストでは引用符も改行も含まないので、エスケープは要らない。 */
	private static String json(Map<String, String> fields) {
		StringBuilder sb = new StringBuilder("{");
		fields.forEach((k, v) -> sb.append(sb.length() > 1 ? "," : "").append('"').append(k).append("\":\"")
				.append(v).append('"'));
		return sb.append('}').toString();
	}

	/** Set-Cookie は複数ありうるので、refresh_token のものだけを選んで、値を返す。無ければ null。 */
	private static String cookieValue(MvcResult result) {
		return setCookieHeader(result.getResponse()) == null ? null
				: setCookieHeader(result.getResponse()).split(";", 2)[0].substring(COOKIE_NAME.length() + 1);
	}

	private static String setCookieHeader(MockHttpServletResponse response) {
		return response.getHeaders(HttpHeaders.SET_COOKIE).stream()
				.filter(h -> h.startsWith(COOKIE_NAME + "="))
				.findFirst()
				.orElse(null);
	}

	private static String body(MvcResult result, String path) throws Exception {
		return JsonPath.read(result.getResponse().getContentAsString(), path);
	}

	private static int statusOf(MvcResult result) {
		return result.getResponse().getStatus();
	}

	@ParameterizedTest(name = "{0} に対になっていないサロゲート")
	@ValueSource(strings = { "displayName", "username", "email" })
	@DisplayName("対になっていないサロゲートを含む登録は、500 にならず 201 か 422 で終わる")
	void loneSurrogateIsNeverA500(String field) throws Exception {
		String username = newName("sur");
		Map<String, String> values = new LinkedHashMap<>();
		values.put("username", username);
		values.put("displayName", "テスト");
		values.put("email", username + "@example.com");
		values.put("password", PASSWORD);
		// JSON のエスケープ \\uD800 で送る。生のバイトでは UTF-8 として不正になり、別の理由の 400 になってしまう。
		values.put(field, values.get(field).substring(0, 2) + "\\uD800" + values.get(field).substring(2));

		MvcResult result = mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content(json(values)))
				.andReturn();

		// 本物の DB で確かめた結果、displayName と email は 201 になる。PostgreSQL の JDBC ドライバーは対になっていない
		// サロゲートを "?" に置き換えて保存するので、500 にはならない。この先 500 に変わらないことを守る。
		assertThat(statusOf(result)).isIn(201, 422);
		if ("username".equals(field)) {
			// ユーザー名は @Pattern（英数字と _）で必ず弾かれる。
			assertThat(statusOf(result)).isEqualTo(422);
		}
	}

	@Test
	@DisplayName("登録、me、ログイン、更新、古い Cookie での更新の失敗、ログアウト、ログアウト後の更新の失敗が、続けて動く")
	void registerLoginMeRefreshLogout() throws Exception {
		String username = newName("flow");
		String email = username + "@example.com";

		MvcResult registered = register(username, email, PASSWORD);
		assertThat(statusOf(registered)).isEqualTo(201);
		String accessToken = body(registered, "$.accessToken");
		assertThat(cookieValue(registered)).isNotBlank();

		mockMvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value(username))
				.andExpect(jsonPath("$.isMe").value(true));

		MvcResult loggedIn = login(email, PASSWORD);
		assertThat(statusOf(loggedIn)).isEqualTo(200);
		String oldCookie = cookieValue(loggedIn);
		assertThat(oldCookie).isNotBlank();

		MvcResult refreshed = refresh(oldCookie, null);
		assertThat(statusOf(refreshed)).isEqualTo(200);
		String newCookie = cookieValue(refreshed);
		assertThat(newCookie).isNotBlank().isNotEqualTo(oldCookie);
		assertThat(body(refreshed, "$.accessToken")).isNotBlank();

		MvcResult reused = refresh(oldCookie, null);
		assertThat(statusOf(reused)).isEqualTo(401);

		MvcResult loggedOut = logout(newCookie, null);
		assertThat(statusOf(loggedOut)).isEqualTo(204);

		assertThat(statusOf(refresh(newCookie, null))).isEqualTo(401);
	}

	@Test
	@DisplayName("ログインのメールアドレスは大文字小文字を区別しない")
	void loginIgnoresEmailCase() throws Exception {
		String username = newName("case");
		assertThat(statusOf(register(username, "Alice_" + username + "@Example.com", PASSWORD))).isEqualTo(201);

		MvcResult result = login("alice_" + username.toLowerCase() + "@example.com", PASSWORD);

		assertThat(statusOf(result)).isEqualTo(200);
	}

	@Test
	@DisplayName("大文字小文字だけ違うユーザー名での登録は 409 USERNAME_TAKEN")
	void duplicateUsernameCaseInsensitiveReturns409() throws Exception {
		String lower = newName("bob").toLowerCase();
		String upper = lower.toUpperCase();
		assertThat(statusOf(register(lower, lower + "@example.com", PASSWORD))).isEqualTo(201);

		mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content(json(Map.of("username", upper, "displayName", "テスト", "email", upper + "@example.net",
						"password", PASSWORD))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("USERNAME_TAKEN"));
	}

	@Test
	@DisplayName("保存されたパスワードは BCrypt のハッシュで、平文ではない")
	void storedPasswordIsBcrypt() throws Exception {
		String username = newName("hash");
		assertThat(statusOf(register(username, username + "@example.com", PASSWORD))).isEqualTo(201);

		String stored = jdbc.queryForObject("SELECT password_hash FROM users WHERE username = ?", String.class,
				username);

		assertThat(stored).startsWith("$2").isNotEqualTo(PASSWORD).doesNotContain(PASSWORD);
	}

	@Test
	@DisplayName("壊れた Bearer が残っていても、更新は 200、ログアウトは 204 で Cookie を消し、その後の更新は 401")
	void staleBearerDoesNotBlockAuthEndpoints() throws Exception {
		String username = newName("stale");
		MvcResult registered = register(username, username + "@example.com", PASSWORD);
		assertThat(statusOf(registered)).isEqualTo(201);
		String stale = "not-a-valid-jwt";

		MvcResult refreshed = refresh(cookieValue(registered), stale);
		assertThat(statusOf(refreshed)).isEqualTo(200);
		String newCookie = cookieValue(refreshed);
		assertThat(newCookie).isNotBlank();

		MvcResult loggedOut = logout(newCookie, stale);
		assertThat(statusOf(loggedOut)).isEqualTo(204);
		String clearing = setCookieHeader(loggedOut.getResponse());
		assertThat(clearing).isNotNull().contains("Max-Age=0");

		assertThat(statusOf(refresh(newCookie, null))).isEqualTo(401);
	}

	@Test
	@DisplayName("同じ Cookie の更新を同時に 2 つ送ると、成功は 1 つだけ")
	void concurrentRefreshAllowsOnlyOne() throws Exception {
		String username = newName("race");
		MvcResult registered = register(username, username + "@example.com", PASSWORD);
		String cookie = cookieValue(registered);

		List<Integer> statuses = runConcurrently(() -> statusOf(refresh(cookie, null)),
				() -> statusOf(refresh(cookie, null)));

		assertThat(statuses).containsExactlyInAnyOrder(200, 401);
	}

	@Test
	@DisplayName("同じユーザー名の登録を同時に 2 つ送ると、成功は 1 つで、利用者は 1 人だけ")
	void concurrentRegisterSameUsernameCreatesOne() throws Exception {
		String username = newName("dup");

		List<Integer> statuses = runConcurrently(
				() -> statusOf(register(username, "a_" + username + "@example.com", PASSWORD)),
				() -> statusOf(register(username, "b_" + username + "@example.com", PASSWORD)));

		assertThat(statuses).containsExactlyInAnyOrder(201, 409);
		Integer count = jdbc.queryForObject("SELECT count(*) FROM users WHERE lower(username) = lower(?)",
				Integer.class, username);
		assertThat(count).isEqualTo(1);
	}

	@Test
	@DisplayName("認証の出来事が 1 件ずつ残り、失敗の行に利用者 id が無く、秘密の値はどの行にも出ない")
	void authEventsAreLoggedWithoutSecrets(CapturedOutput output) throws Exception {
		String username = newName("log");
		String email = username + "@example.com";
		String wrongPassword = "Wr0ng!password";
		List<String> requestIds = new ArrayList<>();

		MvcResult registered = register(username, email, PASSWORD);
		requestIds.add(requestId(registered));
		String userId = body(registered, "$.user.id");
		String registerAccessToken = body(registered, "$.accessToken");
		String registerCookie = cookieValue(registered);

		MvcResult failed = login(email, wrongPassword);
		requestIds.add(requestId(failed));
		assertThat(statusOf(failed)).isEqualTo(401);

		MvcResult succeeded = login(email, PASSWORD);
		requestIds.add(requestId(succeeded));
		assertThat(statusOf(succeeded)).isEqualTo(200);
		String loginAccessToken = body(succeeded, "$.accessToken");
		String loginCookie = cookieValue(succeeded);

		MvcResult loggedOut = logout(loginCookie, null);
		requestIds.add(requestId(loggedOut));
		assertThat(statusOf(loggedOut)).isEqualTo(204);

		List<Map<String, Object>> mine = LogLines.parse(output).stream()
				.filter(line -> requestIds.contains(LogLines.get(line, "http.request.id")))
				.toList();
		assertThat(mine).isNotEmpty();

		List<Map<String, Object>> registerLines = LogLines.withAction(mine, "auth.register");
		List<Map<String, Object>> failedLines = LogLines.withAction(mine, "auth.login.failed");
		List<Map<String, Object>> succeededLines = LogLines.withAction(mine, "auth.login.succeeded");
		List<Map<String, Object>> logoutLines = LogLines.withAction(mine, "auth.logout");
		assertThat(registerLines).hasSize(1);
		assertThat(failedLines).hasSize(1);
		assertThat(succeededLines).hasSize(1);
		assertThat(logoutLines).hasSize(1);
		assertThat(LogLines.get(failedLines.get(0), "user.id")).isNull();
		assertThat(LogLines.get(succeededLines.get(0), "user.id")).isEqualTo(userId);

		// パスワードとトークンは、DEBUG を含む出力のどこにも無い。値はこのテスト専用なので、全体を見て誤検出しない。
		String all = output.getOut();
		for (String secret : List.of(PASSWORD, wrongPassword, registerAccessToken, loginAccessToken, registerCookie,
				loginCookie)) {
			assertThat(all).doesNotContain(secret);
		}
		// メールアドレスは DEBUG の SQL の引数に出るので、INFO 以上の行だけを見る。
		List<Map<String, Object>> important = mine.stream()
				.filter(line -> Set.of("INFO", "WARN", "ERROR").contains(LogLines.get(line, "log.level")))
				.toList();
		assertThat(important).isNotEmpty();
		assertThat(important).noneSatisfy(line -> assertThat(line.toString().toLowerCase())
				.contains(email.toLowerCase()));
	}

	private static String requestId(MvcResult result) {
		String id = result.getResponse().getHeader("X-Request-Id");
		assertThat(id).isNotBlank();
		return id;
	}

	/**
	 * 2 つの処理を、開始の合図をそろえて別スレッドから同時に走らせ、返した値（HTTP の status）を集める。
	 * 待ちには時間切れを付け、デッドロックしてもビルドが止まらず失敗になるようにする。
	 */
	@SafeVarargs
	private static List<Integer> runConcurrently(Callable<Integer>... tasks) throws Exception {
		ExecutorService executor = Executors.newFixedThreadPool(tasks.length);
		try {
			CountDownLatch ready = new CountDownLatch(tasks.length);
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> futures = new ArrayList<>();
			for (Callable<Integer> task : tasks) {
				futures.add(executor.submit(() -> {
					ready.countDown();
					start.await();
					return task.call();
				}));
			}
			assertThat(ready.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();
			start.countDown();
			List<Integer> results = new ArrayList<>();
			for (Future<Integer> future : futures) {
				results.add(future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS));
			}
			return results;
		} finally {
			executor.shutdownNow();
		}
	}

}
