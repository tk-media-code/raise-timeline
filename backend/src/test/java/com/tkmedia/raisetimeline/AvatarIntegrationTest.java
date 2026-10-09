package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.InMemoryImageStorageConfig;
import com.tkmedia.raisetimeline.image.TestImages;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/**
 * アイコンの差し替えを、本物の PostgreSQL（テスト専用 DB）とメモリ上の保存先で端から端まで確かめる。
 *
 * <p>Spring のアップロード上限は MockMvc では効かないので、ここで見る 2 MB の境界は
 * {@code ImageUploadRules} の検査によるもの。{@code @Transactional} は付けない（{@link PostImagesIntegrationTest} と同じ理由）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(InMemoryImageStorageConfig.class)
class AvatarIntegrationTest {

	private static final String PASSWORD = "Passw0rd!secret";
	private static final String URL_PREFIX = "https://images.test/";

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

	private record Account(String username, String userId, String token) {
	}

	private Account newAccount() throws Exception {
		String username = "ava_" + UUID.randomUUID().toString().substring(0, 8);
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

	private MvcResult putAvatar(Account account, byte[] content) throws Exception {
		MockMultipartHttpServletRequestBuilder request = multipart(HttpMethod.PUT, "/api/users/me/avatar")
				.file(new MockMultipartFile("file", "icon.bin", "application/octet-stream", content))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token());
		return mockMvc.perform(request).andReturn();
	}

	private MvcResult getAs(Account account, String path) throws Exception {
		return mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private static int statusOf(MvcResult result) {
		return result.getResponse().getStatus();
	}

	@Test
	@DisplayName("PUT で 200 { avatarUrl }。me・プロフィール・自分の投稿の author が同じ URL になる")
	void replaceShowsSameUrlEverywhere() throws Exception {
		Account taro = newAccount();
		MvcResult before = getAs(taro, "/api/users/me");
		MvcResult created = mockMvc.perform(multipart("/api/posts").param("body", "こんにちは")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + taro.token())).andReturn();

		MvcResult put = putAvatar(taro, TestImages.png());

		assertThat(statusOf(put)).isEqualTo(200);
		String url = JsonPath.read(json(put), "$.avatarUrl");
		assertThat(url).matches(URL_PREFIX + "avatars/" + taro.userId() + "/[0-9a-f-]{36}\\.png");
		assertThat(JsonPath.<Object>read(json(before), "$.avatarUrl")).isNull();
		assertThat((String) JsonPath.read(json(getAs(taro, "/api/users/me")), "$.avatarUrl")).isEqualTo(url);
		assertThat((String) JsonPath.read(json(getAs(taro, "/api/users/" + taro.username())), "$.avatarUrl"))
				.isEqualTo(url);
		String postId = JsonPath.read(json(created), "$.id");
		assertThat((String) JsonPath.read(json(getAs(taro, "/api/posts/" + postId)), "$.author.avatarUrl"))
				.isEqualTo(url);
		assertThat((String) JsonPath.read(json(getAs(taro, "/api/users/" + taro.username() + "/posts")),
				"$.items[0].author.avatarUrl")).isEqualTo(url);
		assertThat(storage.objects().get(url.substring(URL_PREFIX.length())).contentType()).isEqualTo("image/png");
	}

	@Test
	@DisplayName("2 回差し替えると、保存先にはその人のオブジェクトが 1 つだけ残る")
	void replacingTwiceLeavesOneObject() throws Exception {
		Account taro = newAccount();

		MvcResult first = putAvatar(taro, TestImages.png());
		MvcResult second = putAvatar(taro, TestImages.gif());

		assertThat(statusOf(first)).isEqualTo(200);
		assertThat(statusOf(second)).isEqualTo(200);
		String firstKey = ((String) JsonPath.read(json(first), "$.avatarUrl")).substring(URL_PREFIX.length());
		String secondKey = ((String) JsonPath.read(json(second), "$.avatarUrl")).substring(URL_PREFIX.length());
		assertThat(secondKey).isNotEqualTo(firstKey).endsWith(".gif");
		assertThat(storage.objects()).containsOnlyKeys(secondKey);
		assertThat(storage.deletedKeys()).containsExactly(firstKey);
		String stored = jdbc.queryForObject("SELECT avatar_key FROM users WHERE id = ?::uuid", String.class,
				taro.userId());
		assertThat(stored).isEqualTo(secondKey);
	}

	@Test
	@DisplayName("2 MB ちょうどは通り、2 MB + 1 バイトは 413 で、アイコンは変わらない")
	void sizeBoundary() throws Exception {
		Account taro = newAccount();

		MvcResult ok = putAvatar(taro, TestImages.pngOfSize(2_097_152));
		String key = ((String) JsonPath.read(json(ok), "$.avatarUrl")).substring(URL_PREFIX.length());
		MvcResult tooLarge = putAvatar(taro, TestImages.pngOfSize(2_097_153));

		assertThat(statusOf(ok)).isEqualTo(200);
		assertThat(statusOf(tooLarge)).isEqualTo(413);
		assertThat((String) JsonPath.read(json(tooLarge), "$.code")).isEqualTo("FILE_TOO_LARGE");
		assertThat(storage.objects()).containsOnlyKeys(key);
	}

	@Test
	@DisplayName("SVG は 415、壊れた JPEG は項目 file の 422 で、保存先は空")
	void invalidImagesStoreNothing() throws Exception {
		Account taro = newAccount();

		MvcResult svg = putAvatar(taro, TestImages.svg());
		MvcResult broken = putAvatar(taro, TestImages.fakeJpeg());

		assertThat(statusOf(svg)).isEqualTo(415);
		assertThat(statusOf(broken)).isEqualTo(422);
		assertThat((String) JsonPath.read(json(broken), "$.errors[0].field")).isEqualTo("file");
		assertThat(storage.objects()).isEmpty();
	}

	@Test
	@DisplayName("file の部品が無ければ 400")
	void missingPartReturns400() throws Exception {
		Account taro = newAccount();

		MvcResult result = mockMvc.perform(multipart(HttpMethod.PUT, "/api/users/me/avatar")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + taro.token())).andReturn();

		assertThat(statusOf(result)).isEqualTo(400);
		assertThat(storage.objects()).isEmpty();
	}

	@Test
	@DisplayName("未ログインは 401")
	void unauthenticatedReturns401() throws Exception {
		MvcResult result = mockMvc.perform(multipart(HttpMethod.PUT, "/api/users/me/avatar")
				.file(new MockMultipartFile("file", "a.png", "image/png", TestImages.png()))).andReturn();

		assertThat(statusOf(result)).isEqualTo(401);
		assertThat(storage.objects()).isEmpty();
	}

}
