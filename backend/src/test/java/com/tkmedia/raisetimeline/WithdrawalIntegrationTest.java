package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.InMemoryImageStorageConfig;
import com.tkmedia.raisetimeline.image.TestImages;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.logging.LogLines;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 退会を、本物の PostgreSQL（テスト専用 DB）とメモリ上の保存先で端から端まで確かめる。
 *
 * <p>消えるものは DB の行と保存先のオブジェクトの両方を見る。{@code user.withdrew} のログは、JSON のログが
 * Spring の文脈の中でだけ出るので、単体テストではなくここで読む。{@code @Transactional} は付けない
 * （{@link PostImagesIntegrationTest} と同じ理由）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(InMemoryImageStorageConfig.class)
@ExtendWith(OutputCaptureExtension.class)
class WithdrawalIntegrationTest {

	private static final String PASSWORD = "Passw0rd!secret";
	private static final String COOKIE_NAME = "refresh_token";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private InMemoryImageStorage storage;

	private final List<String> usernames = new ArrayList<>();

	@BeforeEach
	void resetStorage() {
		storage.clear();
	}

	@AfterEach
	void cleanUp() {
		for (String username : usernames) {
			jdbc.update("DELETE FROM users WHERE lower(username) = lower(?)", username);
		}
		storage.clear();
	}

	private record Account(String username, String email, String userId, String token, String refreshCookie) {
	}

	private Account newAccount() throws Exception {
		return register("wd_" + UUID.randomUUID().toString().substring(0, 8));
	}

	private Account register(String username) throws Exception {
		usernames.add(username);
		String email = username + "@example.com";
		MvcResult result = mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"" + username + "\",\"displayName\":\"テスト\",\"email\":\"" + email
						+ "\",\"password\":\"" + PASSWORD + "\"}"))
				.andReturn();
		assertThat(statusOf(result)).isEqualTo(201);
		String json = json(result);
		String setCookie = result.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
				.filter(h -> h.startsWith(COOKIE_NAME + "="))
				.findFirst()
				.orElseThrow();
		String cookie = setCookie.split(";", 2)[0].substring(COOKIE_NAME.length() + 1);
		return new Account(username, email, JsonPath.read(json, "$.user.id"), JsonPath.read(json, "$.accessToken"),
				cookie);
	}

	private void createPostWithImages(Account account, int imageCount) throws Exception {
		var request = multipart("/api/posts").param("body", "画像つき")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token());
		for (int i = 0; i < imageCount; i++) {
			request.file(new MockMultipartFile("images", "x.png", "image/png", TestImages.png()));
		}
		assertThat(statusOf(mockMvc.perform(request).andReturn())).isEqualTo(201);
	}

	/** 文字だけの投稿を作り、その id を返す。 */
	private String createTextPost(Account account) throws Exception {
		MvcResult result = mockMvc.perform(multipart("/api/posts").param("body", "いいねの的")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
		assertThat(statusOf(result)).isEqualTo(201);
		return JsonPath.read(json(result), "$.id");
	}

	private void like(Account account, String postId) throws Exception {
		MvcResult result = mockMvc.perform(put("/api/posts/{id}/like", postId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
		assertThat(statusOf(result)).isEqualTo(204);
	}

	private void putAvatar(Account account) throws Exception {
		var request = multipart(HttpMethod.PUT, "/api/users/me/avatar")
				.file(new MockMultipartFile("file", "icon.png", "image/png", TestImages.png()))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token());
		assertThat(statusOf(mockMvc.perform(request).andReturn())).isEqualTo(200);
	}

	private MvcResult withdraw(Account account, String password) throws Exception {
		return mockMvc.perform(delete("/api/users/me")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())
				.contentType(MediaType.APPLICATION_JSON)
				.content(("{\"password\":\"" + password + "\"}").getBytes(StandardCharsets.UTF_8))).andReturn();
	}

	private MvcResult getMe(String token) throws Exception {
		return mockMvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andReturn();
	}

	private MvcResult getPost(Account account, String postId) throws Exception {
		return mockMvc.perform(get("/api/posts/{id}", postId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private static int statusOf(MvcResult result) {
		return result.getResponse().getStatus();
	}

	private int count(String sql, String userId) {
		Integer count = jdbc.queryForObject(sql, Integer.class, userId);
		return count == null ? 0 : count;
	}

	private int userRows(Account account) {
		return count("SELECT count(*) FROM users WHERE id = ?::uuid", account.userId());
	}

	private int postRows(Account account) {
		return count("SELECT count(*) FROM posts WHERE user_id = ?::uuid", account.userId());
	}

	private int imageRows(Account account) {
		return count("SELECT count(*) FROM post_images i JOIN posts p ON p.id = i.post_id WHERE p.user_id = ?::uuid",
				account.userId());
	}

	private int tokenRows(Account account) {
		return count("SELECT count(*) FROM refresh_tokens WHERE user_id = ?::uuid", account.userId());
	}

	@Test
	@DisplayName("画像付きの投稿 2 件とアイコンを持つ人が退会すると 204 で、その人の行・投稿・画像の行・リフレッシュトークンが消え、"
			+ "保存先からその人のキーが全部消える。別の人の投稿と画像は残る")
	void withdrawRemovesEverythingOfTheUserOnly() throws Exception {
		Account hanako = newAccount();
		createPostWithImages(hanako, 1);
		Set<String> hanakoKeys = storage.objects().keySet();
		Account taro = newAccount();
		createPostWithImages(taro, 2);
		createPostWithImages(taro, 1);
		putAvatar(taro);
		assertThat(storage.objects()).hasSize(hanakoKeys.size() + 4);
		assertThat(imageRows(taro)).isEqualTo(3);
		assertThat(tokenRows(taro)).isEqualTo(1);

		MvcResult result = withdraw(taro, PASSWORD);

		assertThat(statusOf(result)).isEqualTo(204);
		assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
				.anySatisfy(h -> assertThat(h).startsWith(COOKIE_NAME + "=;").contains("Max-Age=0"));
		assertThat(userRows(taro)).isZero();
		assertThat(postRows(taro)).isZero();
		assertThat(imageRows(taro)).isZero();
		assertThat(tokenRows(taro)).isZero();
		assertThat(storage.objects()).containsOnlyKeys(hanakoKeys.toArray(String[]::new));
		assertThat(userRows(hanako)).isEqualTo(1);
		assertThat(postRows(hanako)).isEqualTo(1);
		assertThat(imageRows(hanako)).isEqualTo(1);
		assertThat(tokenRows(hanako)).isEqualTo(1);
	}

	@Test
	@DisplayName("退会のあと、古いアクセストークンで GET /api/users/me は 401 UNAUTHENTICATED、古い Cookie で POST /api/auth/refresh は 401")
	void oldCredentialsAreRejectedAfterWithdrawal() throws Exception {
		Account taro = newAccount();
		assertThat(statusOf(getMe(taro.token()))).isEqualTo(200);
		assertThat(statusOf(withdraw(taro, PASSWORD))).isEqualTo(204);

		MvcResult me = getMe(taro.token());
		MvcResult refreshed = mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie(COOKIE_NAME, taro.refreshCookie())))
				.andReturn();

		assertThat(statusOf(me)).isEqualTo(401);
		assertThat((String) JsonPath.read(json(me), "$.code")).isEqualTo("UNAUTHENTICATED");
		assertThat(statusOf(refreshed)).isEqualTo(401);
	}

	@Test
	@DisplayName("退会のあと、同じユーザー名とメールアドレスで登録でき（201）、古いトークンは 401 のまま")
	void sameIdentityCanRegisterAgain() throws Exception {
		Account first = newAccount();
		assertThat(statusOf(withdraw(first, PASSWORD))).isEqualTo(204);

		Account second = register(first.username());

		assertThat(second.email()).isEqualTo(first.email());
		assertThat(second.userId()).isNotEqualTo(first.userId());
		assertThat(statusOf(getMe(second.token()))).isEqualTo(200);
		assertThat(statusOf(getMe(first.token()))).isEqualTo(401);
	}

	@Test
	@DisplayName("パスワードが違えば 401 INVALID_PASSWORD で、何も消えない")
	void wrongPasswordRemovesNothing() throws Exception {
		Account taro = newAccount();
		createPostWithImages(taro, 2);
		putAvatar(taro);
		Set<String> keysBefore = storage.objects().keySet();

		MvcResult result = withdraw(taro, "wrong-password");

		assertThat(statusOf(result)).isEqualTo(401);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("INVALID_PASSWORD");
		assertThat((String) JsonPath.read(json(result), "$.detail")).isEqualTo("パスワードが違います");
		assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
		assertThat(userRows(taro)).isEqualTo(1);
		assertThat(postRows(taro)).isEqualTo(1);
		assertThat(imageRows(taro)).isEqualTo(2);
		assertThat(tokenRows(taro)).isEqualTo(1);
		assertThat(storage.objects()).containsOnlyKeys(keysBefore.toArray(String[]::new));
		assertThat(storage.deletedKeys()).isEmpty();
		assertThat(statusOf(getMe(taro.token()))).isEqualTo(200);
	}

	@Test
	@DisplayName("S3 の削除が失敗しても 204 で、WARN の image.delete_failed に消せなかったキーが載る")
	void storageFailureStillReturns204AndLogsKeys(CapturedOutput output) throws Exception {
		Account taro = newAccount();
		createPostWithImages(taro, 2);
		putAvatar(taro);
		List<String> keys = List.copyOf(storage.objects().keySet());
		storage.failDeletes();

		MvcResult result = withdraw(taro, PASSWORD);

		assertThat(statusOf(result)).isEqualTo(204);
		assertThat(userRows(taro)).isZero();
		String requestId = result.getResponse().getHeader("X-Request-Id");
		List<Map<String, Object>> mine = LogLines.parse(output).stream()
				.filter(line -> requestId.equals(LogLines.get(line, LogFields.HTTP_REQUEST_ID)))
				.toList();
		List<Map<String, Object>> failed = LogLines.withAction(mine, LogEvents.IMAGE_DELETE_FAILED);
		assertThat(failed).hasSize(1);
		assertThat(LogLines.get(failed.get(0), "log.level")).isEqualTo("WARN");
		@SuppressWarnings("unchecked")
		List<String> logged = (List<String>) LogLines.get(failed.get(0), LogFields.APP_IMAGE_KEYS);
		assertThat(logged).containsExactlyInAnyOrderElementsOf(keys);
	}

	@Test
	@DisplayName("退会が出来事 user.withdrew として INFO で残り、利用者 id が付き、パスワードはどの行にも出ない")
	void withdrawalIsLoggedWithoutPassword(CapturedOutput output) throws Exception {
		Account taro = newAccount();

		MvcResult result = withdraw(taro, PASSWORD);

		assertThat(statusOf(result)).isEqualTo(204);
		String requestId = result.getResponse().getHeader("X-Request-Id");
		List<Map<String, Object>> mine = LogLines.parse(output).stream()
				.filter(line -> requestId.equals(LogLines.get(line, LogFields.HTTP_REQUEST_ID)))
				.toList();
		List<Map<String, Object>> events = LogLines.withAction(mine, LogEvents.USER_WITHDREW);
		assertThat(events).hasSize(1);
		assertThat(LogLines.get(events.get(0), "log.level")).isEqualTo("INFO");
		assertThat(LogLines.get(events.get(0), LogFields.USER_ID)).isEqualTo(taro.userId());
		assertThat(LogLines.get(events.get(0), "message")).isEqualTo("退会した");
		assertThat(mine).isNotEmpty();
		assertThat(mine).noneSatisfy(line -> assertThat(line.toString()).contains(PASSWORD));
		assertThat(output.getOut()).doesNotContain(PASSWORD);
	}

	@Test
	@DisplayName("退会すると、本人のいいねと、本人の投稿へのいいねが消え、他人の投稿の likeCount が減る")
	void withdrawalRemovesLikesGivenAndReceived() throws Exception {
		Account a = newAccount();
		Account b = newAccount();
		String postOfA = createTextPost(a);
		String postOfB = createTextPost(b);
		like(a, postOfB);
		like(b, postOfA);
		assertThat((Integer) JsonPath.read(json(getPost(b, postOfB)), "$.likeCount")).isEqualTo(1);

		assertThat(statusOf(withdraw(a, PASSWORD))).isEqualTo(204);

		assertThat(count("SELECT count(*) FROM likes WHERE user_id = ?::uuid", a.userId())).isZero();
		assertThat(count("SELECT count(*) FROM likes WHERE post_id = ?::uuid", postOfA)).isZero();
		MvcResult postB = getPost(b, postOfB);
		assertThat(statusOf(postB)).isEqualTo(200);
		assertThat((Integer) JsonPath.read(json(postB), "$.likeCount")).isZero();
	}

}
