package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.InMemoryImageStorageConfig;
import com.tkmedia.raisetimeline.image.TestImages;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.apache.commons.imaging.formats.jpeg.JpegImageMetadata;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/**
 * 画像つきの投稿を、本物の PostgreSQL（テスト専用 DB）とメモリ上の保存先で端から端まで確かめる。
 *
 * <p>保存先を {@link InMemoryImageStorage} にするのは、S3 に出ずに「何が保存され、何が消されたか」を見るため。
 * Spring のアップロード上限は MockMvc では効かないので、5 MB の境界は {@link PostMultipartHttpTest} が確かめる。
 * {@code @Transactional} は付けない（{@link PostFlowIntegrationTest} と同じ理由）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(InMemoryImageStorageConfig.class)
class PostImagesIntegrationTest {

	private static final String PASSWORD = "Passw0rd!secret";

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
		String username = "img_" + UUID.randomUUID().toString().substring(0, 8);
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

	/** 申告するファイル名と Content-Type は、中身と合わないことがあるので、呼び出し側が決める。 */
	private MvcResult createPost(Account account, String body, MockMultipartFile... images) throws Exception {
		MockMultipartHttpServletRequestBuilder request = multipart("/api/posts").param("body", body)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token());
		for (MockMultipartFile image : images) {
			request.file(image);
		}
		return mockMvc.perform(request).andReturn();
	}

	private static MockMultipartFile image(byte[] content, String filename, String contentType) {
		return new MockMultipartFile("images", filename, contentType, content);
	}

	private MvcResult send(MockHttpServletRequestBuilder request, Account account) throws Exception {
		return mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + account.token())).andReturn();
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private static boolean hasGps(byte[] jpeg) throws IOException {
		JpegImageMetadata metadata = TestImages.metadataOf(jpeg);
		return metadata != null && metadata.getExif() != null && metadata.getExif().getGpsInfo() != null;
	}

	private static int statusOf(MvcResult result) {
		return result.getResponse().getStatus();
	}

	private int postCountOf(Account account) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM posts WHERE user_id = ?::uuid", Integer.class,
				account.userId());
		return count == null ? 0 : count;
	}

	private int imageRowsOf(Account account) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM post_images i JOIN posts p ON p.id = i.post_id "
				+ "WHERE p.user_id = ?::uuid", Integer.class, account.userId());
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("画像 1 枚つきで 201。images[0].url は保存先の URL で、保存先には正しい Content-Type で入る")
	void createWithOneImage() throws Exception {
		Account taro = newAccount();

		MvcResult created = createPost(taro, "写真つき", image(TestImages.png(), "x.bin", "application/octet-stream"));

		assertThat(statusOf(created)).isEqualTo(201);
		String url = JsonPath.read(json(created), "$.images[0].url");
		assertThat(url).matches("https://images\\.test/posts/[0-9a-f-]{36}\\.png");
		assertThat((String) JsonPath.read(json(created), "$.images[0].id")).isNotBlank();
		assertThat((List<?>) JsonPath.read(json(created), "$.images")).hasSize(1);
		assertThat(storage.objects()).hasSize(1);
		var stored = storage.objects().get(url.substring("https://images.test/".length()));
		assertThat(stored.contentType()).isEqualTo("image/png");
		assertThat(stored.content()).isEqualTo(TestImages.png());
	}

	@Test
	@DisplayName("画像 4 枚は、送った順に position 0 から 3 で並ぶ")
	void createWithFourImagesKeepsOrder() throws Exception {
		Account taro = newAccount();

		MvcResult created = createPost(taro, "4 枚",
				image(TestImages.jpeg(), "a.jpg", "image/jpeg"),
				image(TestImages.png(), "b.png", "image/png"),
				image(TestImages.gif(), "c.gif", "image/gif"),
				image(TestImages.webp(), "d.webp", "image/webp"));

		assertThat(statusOf(created)).isEqualTo(201);
		List<String> urls = JsonPath.read(json(created), "$.images[*].url");
		assertThat(urls).hasSize(4);
		assertThat(urls.get(0)).endsWith(".jpg");
		assertThat(urls.get(1)).endsWith(".png");
		assertThat(urls.get(2)).endsWith(".gif");
		assertThat(urls.get(3)).endsWith(".webp");
		List<String> keys = jdbc.queryForList("SELECT i.object_key FROM post_images i JOIN posts p ON p.id = i.post_id "
				+ "WHERE p.user_id = ?::uuid ORDER BY i.position", String.class, taro.userId());
		assertThat(keys).extracting(k -> "https://images.test/" + k).containsExactlyElementsOf(urls);
	}

	@Test
	@DisplayName("本文が空で画像だけの投稿も作れる")
	void createWithImageOnly() throws Exception {
		Account taro = newAccount();

		MvcResult created = createPost(taro, "", image(TestImages.png(), "a.png", "image/png"));

		assertThat(statusOf(created)).isEqualTo(201);
		assertThat((String) JsonPath.read(json(created), "$.body")).isEmpty();
	}

	@Test
	@DisplayName("GPS 付きの JPEG は、保存先に入った中身に GPS が無い")
	void gpsIsRemovedBeforeStoring() throws Exception {
		Account taro = newAccount();
		byte[] withGps = TestImages.jpegWithGpsAndOrientation();

		MvcResult created = createPost(taro, "位置情報つき", image(withGps, "gps.jpg", "image/jpeg"));

		assertThat(statusOf(created)).isEqualTo(201);
		byte[] stored = storage.objects().values().iterator().next().content();
		assertThat(stored).isNotEqualTo(withGps);
		assertThat(hasGps(stored)).isFalse();
		assertThat(hasGps(withGps)).isTrue();
	}

	@Test
	@DisplayName("SVG と .jpg に偽ったテキストは 415、壊れた JPEG は 422。どちらも保存先は空で、DB に投稿の行が無い")
	void invalidImagesStoreNothing() throws Exception {
		Account taro = newAccount();

		MvcResult svg = createPost(taro, "SVG", image(TestImages.svg(), "photo.jpg", "image/jpeg"));
		MvcResult text = createPost(taro, "偽装", image(TestImages.text(), "photo.jpg", "image/jpeg"));
		MvcResult broken = createPost(taro, "壊れた JPEG", image(TestImages.fakeJpeg(), "photo.jpg", "image/jpeg"));

		assertThat(statusOf(svg)).isEqualTo(415);
		assertThat((String) JsonPath.read(json(svg), "$.code")).isEqualTo("UNSUPPORTED_IMAGE_TYPE");
		assertThat(statusOf(text)).isEqualTo(415);
		assertThat(statusOf(broken)).isEqualTo(422);
		assertThat((String) JsonPath.read(json(broken), "$.errors[0].field")).isEqualTo("images");
		assertThat(storage.objects()).isEmpty();
		assertThat(postCountOf(taro)).isZero();
	}

	@Test
	@DisplayName("5 MB を超える画像は 413 の FILE_TOO_LARGE、5 枚は 422 で、保存先は空")
	void tooLargeAndTooManyStoreNothing() throws Exception {
		Account taro = newAccount();

		MvcResult large = createPost(taro, "大きい", image(TestImages.pngOfSize(5_242_881), "a.png", "image/png"));
		MockMultipartFile png = image(TestImages.png(), "a.png", "image/png");
		MvcResult five = createPost(taro, "5 枚", png, png, png, png, png);

		assertThat(statusOf(large)).isEqualTo(413);
		assertThat((String) JsonPath.read(json(large), "$.code")).isEqualTo("FILE_TOO_LARGE");
		assertThat(statusOf(five)).isEqualTo(422);
		assertThat((String) JsonPath.read(json(five), "$.errors[0].field")).isEqualTo("images");
		assertThat((String) JsonPath.read(json(five), "$.errors[0].message")).isEqualTo("画像は 4 枚までです");
		assertThat(storage.objects()).isEmpty();
		assertThat(postCountOf(taro)).isZero();
	}

	@Test
	@DisplayName("取得・タイムライン・その人の投稿一覧に、同じ images が出る")
	void sameImagesAreShownEverywhere() throws Exception {
		Account taro = newAccount();
		MvcResult created = createPost(taro, "写真", image(TestImages.png(), "a.png", "image/png"),
				image(TestImages.gif(), "b.gif", "image/gif"));
		String id = JsonPath.read(json(created), "$.id");
		Object expected = JsonPath.read(json(created), "$.images");

		MvcResult fetched = send(get("/api/posts/" + id), taro);
		MvcResult timeline = send(get("/api/timeline/all"), taro);
		MvcResult userPosts = send(get("/api/users/" + taro.username() + "/posts"), taro);

		Object fromGet = JsonPath.read(json(fetched), "$.images");
		assertThat(fromGet).isEqualTo(expected);
		List<Object> fromTimeline = JsonPath.read(json(timeline), "$.items[?(@.id=='" + id + "')].images");
		assertThat(fromTimeline.get(0)).isEqualTo(expected);
		List<Object> fromUser = JsonPath.read(json(userPosts), "$.items[0].images");
		assertThat(fromUser).isEqualTo(expected);
	}

	@Test
	@DisplayName("画像つきの投稿は、本文を空に編集できる。画像の無い投稿は 422")
	void editBodyToEmptyOnlyWithImages() throws Exception {
		Account taro = newAccount();
		String withImage = JsonPath.read(json(createPost(taro, "写真", image(TestImages.png(), "a.png", "image/png"))),
				"$.id");
		String withoutImage = JsonPath.read(json(createPost(taro, "文字だけ")), "$.id");

		MvcResult emptied = send(patch("/api/posts/" + withImage).contentType(MediaType.APPLICATION_JSON)
				.content("{\"body\":\"\"}".getBytes(StandardCharsets.UTF_8)), taro);
		MvcResult rejected = send(patch("/api/posts/" + withoutImage).contentType(MediaType.APPLICATION_JSON)
				.content("{\"body\":\"\"}".getBytes(StandardCharsets.UTF_8)), taro);

		assertThat(statusOf(emptied)).isEqualTo(200);
		assertThat((String) JsonPath.read(json(emptied), "$.body")).isEmpty();
		assertThat((List<?>) JsonPath.read(json(emptied), "$.images")).hasSize(1);
		assertThat(statusOf(rejected)).isEqualTo(422);
	}

	@Test
	@DisplayName("削除で 204 になり、保存先から画像が消え、画像の行も残らない")
	void deleteRemovesImages() throws Exception {
		Account taro = newAccount();
		MvcResult created = createPost(taro, "消す", image(TestImages.png(), "a.png", "image/png"),
				image(TestImages.jpeg(), "b.jpg", "image/jpeg"));
		String id = JsonPath.read(json(created), "$.id");
		assertThat(storage.objects()).hasSize(2);
		assertThat(imageRowsOf(taro)).isEqualTo(2);

		MvcResult deleted = send(delete("/api/posts/" + id), taro);

		assertThat(statusOf(deleted)).isEqualTo(204);
		assertThat(storage.objects()).isEmpty();
		assertThat(storage.deletedKeys()).hasSize(2);
		assertThat(imageRowsOf(taro)).isZero();
	}

	@Test
	@DisplayName("保存先の削除が失敗しても、投稿の削除は 204 で成功する")
	void deleteSucceedsEvenIfStorageFails() throws Exception {
		Account taro = newAccount();
		String id = JsonPath.read(json(createPost(taro, "消す", image(TestImages.png(), "a.png", "image/png"))), "$.id");
		storage.failDeletes();

		MvcResult deleted = send(delete("/api/posts/" + id), taro);

		assertThat(statusOf(deleted)).isEqualTo(204);
		assertThat(postCountOf(taro)).isZero();
	}

}
