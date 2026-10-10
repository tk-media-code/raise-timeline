package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * プロフィールの取得と、その人の投稿一覧を、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>{@code @Transactional} は付けない（{@link PostFlowIntegrationTest} と同じ理由）。各テストが作った利用者を
 * {@link #cleanUp()} で消す。投稿は外部キーの連鎖で消える。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProfileIntegrationTest {

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

	private record Account(String username, String userId, String token, String email) {
	}

	private Account newAccount(String prefix) throws Exception {
		String username = prefix + "_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(username);
		String email = username + "@example.com";
		MvcResult result = mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"" + username + "\",\"displayName\":\"テスト\",\"email\":\"" + email
						+ "\",\"password\":\"" + PASSWORD + "\"}"))
				.andReturn();
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		String json = result.getResponse().getContentAsString();
		return new Account(username, JsonPath.read(json, "$.user.id"), JsonPath.read(json, "$.accessToken"), email);
	}

	private void createPost(Account account, String body) throws Exception {
		MvcResult result = mockMvc.perform(multipart("/api/posts").param("body", body)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
	}

	private MvcResult getAs(Account viewer, String path) throws Exception {
		return mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + viewer.token())).andReturn();
	}

	private MvcResult patchMe(Account account, String json) throws Exception {
		return mockMvc.perform(patch("/api/users/me").contentType(MediaType.APPLICATION_JSON)
				.content(json.getBytes(StandardCharsets.UTF_8))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private static String text(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	@Test
	@DisplayName("大文字小文字を区別せずに他人のプロフィールが引け、isMe は false で、メールアドレスは応答に無い")
	void profileIgnoresCaseAndHidesEmail() throws Exception {
		Account alice = newAccount("alice");
		Account bob = newAccount("bob");

		MvcResult result = getAs(alice, "/api/users/" + bob.username().toUpperCase());

		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		String json = text(result);
		assertThat((String) JsonPath.read(json, "$.id")).isEqualTo(bob.userId());
		assertThat((String) JsonPath.read(json, "$.username")).isEqualTo(bob.username());
		assertThat((Boolean) JsonPath.read(json, "$.isMe")).isFalse();
		assertThat((Boolean) JsonPath.read(json, "$.isFollowing")).isFalse();
		assertThat(json).doesNotContain(bob.email()).doesNotContain("\"email\"");
	}

	@Test
	@DisplayName("自分を引くと isMe が true で、email は無い")
	void ownProfileIsMe() throws Exception {
		Account alice = newAccount("alice");

		MvcResult result = getAs(alice, "/api/users/" + alice.username());

		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		String json = text(result);
		assertThat((Boolean) JsonPath.read(json, "$.isMe")).isTrue();
		assertThat(json).doesNotContain("\"email\"").doesNotContain(alice.email());
	}

	@Test
	@DisplayName("createdAt は UTC の秒までの形で返る")
	void createdAtIsSeconds() throws Exception {
		Account alice = newAccount("alice");

		MvcResult result = getAs(alice, "/api/users/" + alice.username());

		assertThat((String) JsonPath.read(text(result), "$.createdAt"))
				.matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$");
	}

	@Test
	@DisplayName("いない名前・21 文字・日本語は 404、NUL（%00）は 500 にならず 400 になる")
	void unknownOrMalformedUsernameIsNotFound() throws Exception {
		Account alice = newAccount("alice");

		assertThat(getAs(alice, "/api/users/nobody_" + UUID.randomUUID().toString().substring(0, 8))
				.getResponse().getStatus()).isEqualTo(404);
		assertThat(getAs(alice, "/api/users/" + "a".repeat(21)).getResponse().getStatus()).isEqualTo(404);
		assertThat(mockMvc.perform(get(URI.create("/api/users/%E6%97%A5%E6%9C%AC%E8%AA%9E"))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + alice.token())).andReturn()
				.getResponse().getStatus()).isEqualTo(404);
		int nul = mockMvc.perform(get(URI.create("/api/users/a%00b"))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + alice.token())).andReturn()
				.getResponse().getStatus();
		// %00 は Spring Security のファイアウォールがコントローラの手前で 400 にする。
		// 守りたいのは「500 にならない」ことと「不正な名前が DB に届かない」ことで、後者はサービスの単体テストが確かめる。
		assertThat(nul).isEqualTo(400);
	}

	@Test
	@DisplayName("その人の投稿だけが新しい順に 20 件ずつ返り、続きに重複が無く、メールアドレスは応答に無い")
	void userPostsPageThrough() throws Exception {
		Account alice = newAccount("alice");
		Account bob = newAccount("bob");
		for (int i = 0; i < 21; i++) {
			createPost(bob, "ボブの投稿" + i);
		}
		createPost(alice, "アリスの投稿");
		List<String> bobIdsNewestFirst = jdbc.queryForList(
				"SELECT id::text FROM posts WHERE user_id = ?::uuid ORDER BY id DESC", String.class, bob.userId());

		MvcResult first = getAs(alice, "/api/users/" + bob.username() + "/posts");
		assertThat(first.getResponse().getStatus()).isEqualTo(200);
		String firstJson = text(first);
		List<String> firstIds = JsonPath.read(firstJson, "$.items[*].id");
		assertThat(firstIds).containsExactlyElementsOf(bobIdsNewestFirst.subList(0, 20));
		List<String> authorIds = JsonPath.read(firstJson, "$.items[*].author.id");
		assertThat(authorIds).containsOnly(bob.userId());
		String nextCursor = JsonPath.read(firstJson, "$.nextCursor");
		assertThat(nextCursor).isEqualTo(bobIdsNewestFirst.get(19));
		assertThat(firstJson).doesNotContain(bob.email());

		MvcResult second = getAs(alice, "/api/users/" + bob.username() + "/posts?cursor=" + nextCursor);
		assertThat(second.getResponse().getStatus()).isEqualTo(200);
		String secondJson = text(second);
		List<String> secondIds = JsonPath.read(secondJson, "$.items[*].id");
		assertThat(secondIds).containsExactly(bobIdsNewestFirst.get(20));
		Object secondNext = JsonPath.read(secondJson, "$.nextCursor");
		assertThat(secondNext).isNull();
		assertThat(secondJson).doesNotContain(bob.email());
		assertThat(firstIds).doesNotContainAnyElementsOf(secondIds);
	}

	@Test
	@DisplayName("いない利用者の投稿一覧は 404")
	void userPostsOfUnknownUserIsNotFound() throws Exception {
		Account alice = newAccount("alice");

		MvcResult result = getAs(alice, "/api/users/nobody_" + UUID.randomUUID().toString().substring(0, 8) + "/posts");

		assertThat(result.getResponse().getStatus()).isEqualTo(404);
	}

	@Test
	@DisplayName("PATCH で表示名と自己紹介を更新すると、応答にも公開のプロフィールにも反映され、updated_at が進み、CRLF は LF で保存される")
	void updateProfileFlow() throws Exception {
		Account alice = newAccount("alice");
		Account bob = newAccount("bob");
		OffsetDateTime before = jdbc.queryForObject("SELECT updated_at FROM users WHERE id = ?::uuid",
				OffsetDateTime.class, alice.userId());

		MvcResult result = patchMe(alice, "{\"displayName\":\"  新しい名前  \",\"bio\":\"一行目\\r\\n二行目\"}");

		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		String json = text(result);
		assertThat((String) JsonPath.read(json, "$.displayName")).isEqualTo("新しい名前");
		assertThat((String) JsonPath.read(json, "$.bio")).isEqualTo("一行目\n二行目");
		assertThat((String) JsonPath.read(json, "$.email")).isEqualTo(alice.email());
		assertThat((Boolean) JsonPath.read(json, "$.isMe")).isTrue();

		MvcResult profile = getAs(bob, "/api/users/" + alice.username());
		String profileJson = text(profile);
		assertThat((String) JsonPath.read(profileJson, "$.displayName")).isEqualTo("新しい名前");
		assertThat((String) JsonPath.read(profileJson, "$.bio")).isEqualTo("一行目\n二行目");
		assertThat(profileJson).doesNotContain("\"email\"");

		assertThat(jdbc.queryForObject("SELECT bio FROM users WHERE id = ?::uuid", String.class, alice.userId()))
				.isEqualTo("一行目\n二行目");
		OffsetDateTime after = jdbc.queryForObject("SELECT updated_at FROM users WHERE id = ?::uuid",
				OffsetDateTime.class, alice.userId());
		assertThat(after).isAfter(before);
	}

	@Test
	@DisplayName("NUL と対になっていないサロゲートは 422 で、行は変わらない")
	void unusableCharsAreRejected() throws Exception {
		Account alice = newAccount("alice");

		MvcResult nul = patchMe(alice, "{\"displayName\":\"a\\u0000b\",\"bio\":\"\"}");
		MvcResult surrogate = patchMe(alice, "{\"displayName\":\"アリス\",\"bio\":\"\\uD800\"}");

		assertThat(nul.getResponse().getStatus()).isEqualTo(422);
		assertThat(text(nul)).contains("\"displayName\"").contains("使えない文字が含まれています");
		assertThat(surrogate.getResponse().getStatus()).isEqualTo(422);
		assertThat(text(surrogate)).contains("\"bio\"").contains("使えない文字が含まれています");
		assertThat(jdbc.queryForObject("SELECT display_name FROM users WHERE id = ?::uuid", String.class,
				alice.userId())).isEqualTo("テスト");
		assertThat(jdbc.queryForObject("SELECT bio FROM users WHERE id = ?::uuid", String.class, alice.userId()))
				.isEmpty();
	}

	@Test
	@DisplayName("アクセストークンが有効なまま本人の行が消えていたら、PATCH は 401 UNAUTHENTICATED になる")
	void patchWithDeletedUserIsUnauthenticated() throws Exception {
		Account alice = newAccount("alice");
		// 認証のフィルタが、署名と期限のほかに利用者の行があるかも確かめる。行を消すと、有効期間の中でも PATCH の手前で 401 になる。
		jdbc.update("DELETE FROM users WHERE id = ?::uuid", alice.userId());

		MvcResult result = patchMe(alice, "{\"displayName\":\"アリス\",\"bio\":\"\"}");

		assertThat(result.getResponse().getStatus()).isEqualTo(401);
		assertThat(text(result)).contains("\"code\":\"UNAUTHENTICATED\"");
	}

}
