package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.InMemoryImageStorageConfig;
import com.tkmedia.raisetimeline.image.TestImages;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 本物のサーバーに、ブラウザと同じ形の multipart を送って確かめる。
 *
 * <p>ブラウザは、テキストの部品に文字コードを付けずに送る。その部品が UTF-8 として読まれることは、MockMvc では
 * 確かめられない（MockMvc は部品を自前で読み、サーバーの文字コードの設定を通らない）。
 * そのため {@link java.net.http.HttpClient} で、部品のヘッダーを {@code Content-Disposition} だけにして送る。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(InMemoryImageStorageConfig.class)
class PostMultipartHttpTest {

	private static final String PASSWORD = "Passw0rd!secret";
	private static final String BOUNDARY = "----RaiseTimelineTestBoundary";

	@LocalServerPort
	private int port;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private InMemoryImageStorage storage;

	private final HttpClient client = HttpClient.newHttpClient();
	private final List<String> usernames = new ArrayList<>();

	@BeforeEach
	void resetStorage() {
		storage.clear();
	}

	@AfterEach
	void cleanUp() {
		storage.clear();
		for (String username : usernames) {
			jdbc.update("DELETE FROM users WHERE lower(username) = lower(?)", username);
		}
	}

	private URI uri(String path) {
		return URI.create("http://localhost:" + port + path);
	}

	private String register() throws Exception {
		String username = "mp_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(username);
		HttpRequest request = HttpRequest.newBuilder(uri("/api/auth/register"))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"" + username
						+ "\",\"displayName\":\"テスト\",\"email\":\"" + username + "@example.com\",\"password\":\""
						+ PASSWORD + "\"}"))
				.build();
		HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
		assertThat(response.statusCode()).isEqualTo(201);
		return JsonPath.read(response.body(), "$.accessToken");
	}

	/** テキストの部品が 1 つだけの multipart。部品のヘッダーは Content-Disposition だけで、Content-Type も charset も付けない。 */
	private static byte[] multipartBody(String text) {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.writeBytes(("--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"body\"\r\n\r\n")
				.getBytes(StandardCharsets.US_ASCII));
		out.writeBytes(text.getBytes(StandardCharsets.UTF_8));
		out.writeBytes(("\r\n--" + BOUNDARY + "--\r\n").getBytes(StandardCharsets.US_ASCII));
		return out.toByteArray();
	}

	/** 本文の部品に、画像（images）の部品を 1 つ足した multipart。画像の申告は、ブラウザと同じ形にする。 */
	private static byte[] multipartBodyWithImage(String text, byte[] image) {
		// multipartBody が閉じ境界で終わっているので、その手前までを使う。
		byte[] withoutClosing = multipartBody(text);
		int closing = ("--" + BOUNDARY + "--\r\n").length();
		ByteArrayOutputStream result = new ByteArrayOutputStream();
		result.write(withoutClosing, 0, withoutClosing.length - closing);
		result.writeBytes(("--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"images\"; "
				+ "filename=\"photo.png\"\r\nContent-Type: image/png\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
		result.writeBytes(image);
		result.writeBytes(("\r\n--" + BOUNDARY + "--\r\n").getBytes(StandardCharsets.US_ASCII));
		return result.toByteArray();
	}

	private HttpResponse<String> createPostWithImage(String token, String text, byte[] image) throws Exception {
		HttpRequest request = HttpRequest.newBuilder(uri("/api/posts"))
				.header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
				.header("Authorization", "Bearer " + token)
				.POST(HttpRequest.BodyPublishers.ofByteArray(multipartBodyWithImage(text, image)))
				.build();
		return client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
	}

	private HttpResponse<String> createPost(String token, String text) throws Exception {
		HttpRequest request = HttpRequest.newBuilder(uri("/api/posts"))
				.header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
				.header("Authorization", "Bearer " + token)
				.POST(HttpRequest.BodyPublishers.ofByteArray(multipartBody(text)))
				.build();
		return client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
	}

	@Test
	@DisplayName("文字コードの無い multipart の部品でも、日本語と絵文字は UTF-8 として読まれ、CRLF は LF になる")
	void japaneseAndEmojiSurvive() throws Exception {
		String token = register();

		HttpResponse<String> response = createPost(token, "日本語と絵文字😀\r\n二行目");

		assertThat(response.statusCode()).isEqualTo(201);
		assertThat((String) JsonPath.read(response.body(), "$.body")).isEqualTo("日本語と絵文字😀\n二行目");
	}

	@Test
	@DisplayName("270 文字に CRLF を 10 個混ぜた本文は 201 で、取得すると \\r が無く \\n が 10 個ある")
	void crlfIsCountedAsOne() throws Exception {
		String token = register();
		String raw = ("あ".repeat(27) + "\r\n").repeat(10);

		HttpResponse<String> created = createPost(token, raw);

		assertThat(created.statusCode()).isEqualTo(201);
		String id = JsonPath.read(created.body(), "$.id");
		HttpRequest request = HttpRequest.newBuilder(uri("/api/posts/" + id))
				.header("Authorization", "Bearer " + token).GET().build();
		HttpResponse<String> fetched = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
		String body = JsonPath.read(fetched.body(), "$.body");
		assertThat(body).doesNotContain("\r");
		assertThat(body.chars().filter(c -> c == '\n').count()).isEqualTo(10);
	}

	@Test
	@DisplayName("ちょうど 5,242,880 バイトの PNG は 201 で、保存先に入る")
	void imageOfExactlyFiveMegabytesIsAccepted() throws Exception {
		String token = register();

		HttpResponse<String> response = createPostWithImage(token, "5 MB ちょうど", TestImages.pngOfSize(5_242_880));

		assertThat(response.statusCode()).isEqualTo(201);
		assertThat((String) JsonPath.read(response.body(), "$.images[0].url")).startsWith("https://images.test/posts/");
		assertThat(storage.objects()).hasSize(1);
	}

	@Test
	@DisplayName("5,242,881 バイトの PNG は 413 で、本文の code は FILE_TOO_LARGE。何も保存されない")
	void imageOverFiveMegabytesIsRejected() throws Exception {
		String token = register();

		HttpResponse<String> response = createPostWithImage(token, "5 MB 超え", TestImages.pngOfSize(5_242_881));

		assertThat(response.statusCode()).isEqualTo(413);
		assertThat((String) JsonPath.read(response.body(), "$.code")).isEqualTo("FILE_TOO_LARGE");
		assertThat((String) JsonPath.read(response.body(), "$.detail")).isEqualTo("画像が大きすぎます");
		assertThat(storage.objects()).isEmpty();
	}

}
