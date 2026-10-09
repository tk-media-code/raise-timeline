package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.logging.LogLines;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 投稿の作成・取得・編集・削除を、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>{@code @Transactional} は付けない（{@link AuthFlowIntegrationTest} と同じ理由）。各テストが作った利用者を
 * {@link #cleanUp()} で消す。投稿は外部キーの連鎖で消える。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class PostFlowIntegrationTest {

	private static final String PASSWORD = "Passw0rd!secret";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	private final List<String> usernames = new ArrayList<>();

	@AfterEach
	void cleanUp() {
		for (String username : usernames) {
			jdbc.update("DELETE FROM users WHERE lower(username) = lower(?)", username);
		}
	}

	/** 登録の API で利用者を作り、そのアクセストークンと id を持つ。 */
	private record Account(String username, String userId, String token) {
	}

	private Account newAccount(String prefix) throws Exception {
		String username = prefix + "_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(username);
		MvcResult result = mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"" + username + "\",\"displayName\":\"テスト\",\"email\":\"" + username
						+ "@example.com\",\"password\":\"" + PASSWORD + "\"}"))
				.andReturn();
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		String json = result.getResponse().getContentAsString();
		return new Account(username, JsonPath.read(json, "$.user.id"), JsonPath.read(json, "$.accessToken"));
	}

	private MvcResult createPost(Account account, String body) throws Exception {
		return mockMvc.perform(multipart("/api/posts").param("body", body)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private MvcResult getPost(Account account, String id) throws Exception {
		return mockMvc.perform(get("/api/posts/" + id)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private MvcResult editPost(Account account, String id, String jsonBody) throws Exception {
		return mockMvc.perform(patch("/api/posts/" + id)
				.contentType(MediaType.APPLICATION_JSON)
				.content(jsonBody.getBytes(StandardCharsets.UTF_8))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private MvcResult deletePost(Account account, String id) throws Exception {
		return mockMvc.perform(delete("/api/posts/" + id)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private static int statusOf(MvcResult result) {
		return result.getResponse().getStatus();
	}

	private static String field(MvcResult result, String path) throws Exception {
		return JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), path);
	}

	private int postCountOf(Account account) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM posts WHERE user_id = ?::uuid", Integer.class,
				account.userId());
		return count == null ? 0 : count;
	}

	private String storedBody(String id) {
		return jdbc.queryForObject("SELECT body FROM posts WHERE id = ?::uuid", String.class, id);
	}

	@Test
	@DisplayName("作成、取得、編集、削除、削除後の取得の 404 が、続けて動く")
	void createGetEditDelete() throws Exception {
		Account taro = newAccount("flow");

		MvcResult created = createPost(taro, "こんにちは\r\n世界");
		assertThat(statusOf(created)).isEqualTo(201);
		String id = field(created, "$.id");
		assertThat(field(created, "$.body")).isEqualTo("こんにちは\n世界");
		assertThat(field(created, "$.author.username")).isEqualTo(taro.username());
		assertThat(field(created, "$.author.id")).isEqualTo(taro.userId());

		MvcResult fetched = getPost(taro, id);
		assertThat(statusOf(fetched)).isEqualTo(200);
		assertThat(fetched.getResponse().getContentAsString(StandardCharsets.UTF_8))
				.isEqualTo(created.getResponse().getContentAsString(StandardCharsets.UTF_8));
		assertThat((Boolean) JsonPath.read(fetched.getResponse().getContentAsString(), "$.edited")).isFalse();

		MvcResult edited = editPost(taro, id, "{\"body\":\"直した本文\"}");
		assertThat(statusOf(edited)).isEqualTo(200);
		assertThat(field(edited, "$.body")).isEqualTo("直した本文");
		assertThat((Boolean) JsonPath.read(edited.getResponse().getContentAsString(), "$.edited")).isTrue();
		assertThat(field(getPost(taro, id), "$.body")).isEqualTo("直した本文");

		assertThat(statusOf(deletePost(taro, id))).isEqualTo(204);
		assertThat(statusOf(getPost(taro, id))).isEqualTo(404);
	}

	@Test
	@DisplayName("他人の編集と削除は 403 で、本文も行も変わらない")
	void othersCannotEditOrDelete() throws Exception {
		Account owner = newAccount("own");
		Account other = newAccount("oth");
		String id = field(createPost(owner, "私の投稿"), "$.id");

		assertThat(statusOf(editPost(other, id, "{\"body\":\"乗っ取り\"}"))).isEqualTo(403);
		assertThat(storedBody(id)).isEqualTo("私の投稿");

		assertThat(statusOf(deletePost(other, id))).isEqualTo(403);
		assertThat(postCountOf(owner)).isEqualTo(1);
		assertThat(statusOf(getPost(owner, id))).isEqualTo(200);
	}

	@Test
	@DisplayName("NUL と対になっていないサロゲートは、作成も編集も 422 で、行も本文も変わらない")
	void unusableCharsAreRejected() throws Exception {
		Account taro = newAccount("nul");
		String id = field(createPost(taro, "元の本文"), "$.id");

		MvcResult multipartNul = createPost(taro, "a\u0000b");
		assertThat(statusOf(multipartNul)).isEqualTo(422);
		assertThat(field(multipartNul, "$.errors[0].field")).isEqualTo("body");
		assertThat(postCountOf(taro)).isEqualTo(1);

		// JSON のエスケープで送る。生のバイトでは UTF-8 として不正になり、別の理由の 400 になってしまう。
		assertThat(statusOf(editPost(taro, id, "{\"body\":\"a\\u0000b\"}"))).isEqualTo(422);
		assertThat(statusOf(editPost(taro, id, "{\"body\":\"\\uD800\"}"))).isEqualTo(422);
		assertThat(storedBody(id)).isEqualTo("元の本文");
		assertThat(postCountOf(taro)).isEqualTo(1);
	}

	@ParameterizedTest(name = "{index}: 空白だけの本文")
	@ValueSource(strings = { " \n　 ", "", "   " })
	@DisplayName("空白と改行だけの本文は 422 で、「本文か画像を入れてください」")
	void whitespaceOnlyBodyIsRejected(String body) throws Exception {
		Account taro = newAccount("ws");

		MvcResult result = createPost(taro, body);

		assertThat(statusOf(result)).isEqualTo(422);
		assertThat(field(result, "$.errors[0].message")).isEqualTo("本文か画像を入れてください");
		assertThat(postCountOf(taro)).isZero();
	}

	@Test
	@DisplayName("HTML はエスケープも除去もされず、文字のまま保存されて返る")
	void htmlIsStoredAsText() throws Exception {
		Account taro = newAccount("html");
		String html = "<script>alert(1)</script>";

		MvcResult created = createPost(taro, html);

		assertThat(statusOf(created)).isEqualTo(201);
		assertThat(field(created, "$.body")).isEqualTo(html);
		assertThat(storedBody(field(created, "$.id"))).isEqualTo(html);
		assertThat(field(getPost(taro, field(created, "$.id")), "$.body")).isEqualTo(html);
	}

	@Test
	@DisplayName("利用者が消えた後の、まだ有効なトークンでの投稿は 401 UNAUTHENTICATED で、行は増えない")
	void deletedUserCannotPost() throws Exception {
		Account gone = newAccount("gone");
		jdbc.update("DELETE FROM users WHERE id = ?::uuid", gone.userId());

		MvcResult result = createPost(gone, "消えた人の投稿");

		assertThat(statusOf(result)).isEqualTo(401);
		assertThat(field(result, "$.code")).isEqualTo("UNAUTHENTICATED");
		assertThat(postCountOf(gone)).isZero();
	}

	@Test
	@DisplayName("削除の要求に post.deleted の行が 1 本あり、利用者 id と投稿 id が付き、本文はどの行にも出ない")
	void deleteWritesEvent(CapturedOutput output) throws Exception {
		Account taro = newAccount("evt");
		String body = "ログに出てはいけない本文 " + UUID.randomUUID();
		String id = field(createPost(taro, body), "$.id");

		MvcResult deleted = deletePost(taro, id);

		assertThat(statusOf(deleted)).isEqualTo(204);
		String requestId = deleted.getResponse().getHeader("X-Request-Id");
		assertThat(requestId).isNotBlank();
		List<Map<String, Object>> mine = LogLines.parse(output).stream()
				.filter(line -> requestId.equals(LogLines.get(line, "http.request.id")))
				.toList();
		List<Map<String, Object>> events = LogLines.withAction(mine, "post.deleted");
		assertThat(events).hasSize(1);
		assertThat(LogLines.get(events.get(0), "app.post.id")).isEqualTo(id);
		assertThat(LogLines.get(events.get(0), "user.id")).isEqualTo(taro.userId());
		assertThat(mine).isNotEmpty();
		assertThat(mine).noneSatisfy(line -> assertThat(line.toString()).contains(body));
	}

}
