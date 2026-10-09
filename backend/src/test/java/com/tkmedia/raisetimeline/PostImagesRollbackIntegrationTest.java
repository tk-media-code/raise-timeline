package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.InMemoryImageStorageConfig;
import com.tkmedia.raisetimeline.image.TestImages;
import com.tkmedia.raisetimeline.mapper.PostMapper;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 投稿の行と画像の行が 1 つのトランザクションで入ることを、本物の PostgreSQL で確かめる。
 *
 * <p>画像の行を入れるところ（{@code insertImages}）を失敗させ、投稿の行が巻き戻って残らないことと、
 * 先に上げた画像が保存先から消えることを見る。{@code PostMapper} をスパイにすると Spring のテスト文脈が
 * 別になるため、{@link PostImagesIntegrationTest} には混ぜず、このクラスに分けている。
 * {@code @Transactional} は付けない（テスト自身がトランザクションを張ると、巻き戻りを確かめられない）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(InMemoryImageStorageConfig.class)
class PostImagesRollbackIntegrationTest {

	private static final String PASSWORD = "Passw0rd!secret";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private InMemoryImageStorage storage;

	@MockitoSpyBean
	private PostMapper postMapper;

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

	@Test
	@DisplayName("画像の行の insert が失敗すると 500 になり、投稿の行は巻き戻って残らず、上げた画像も消される")
	void failedImageRowInsertRollsBackPostAndDeletesUploadedImage() throws Exception {
		String username = "rb_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(username);
		MvcResult registered = mockMvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"" + username + "\",\"displayName\":\"テスト\",\"email\":\"" + username
						+ "@example.com\",\"password\":\"" + PASSWORD + "\"}"))
				.andReturn();
		assertThat(registered.getResponse().getStatus()).isEqualTo(201);
		String json = registered.getResponse().getContentAsString();
		String userId = JsonPath.read(json, "$.user.id");
		String token = JsonPath.read(json, "$.accessToken");
		doThrow(new IllegalStateException("テスト用に画像の行の insert を失敗させた"))
				.when(postMapper).insertImages(any(), any());

		MvcResult result = mockMvc.perform(multipart("/api/posts").param("body", "写真つき")
				.file(new MockMultipartFile("images", "a.png", "image/png", TestImages.png()))
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andReturn();

		assertThat(result.getResponse().getStatus()).isEqualTo(500);
		// 投稿の行を先に入れてから画像の行が失敗しているので、同じトランザクションでなければここに行が残る。
		Integer posts = jdbc.queryForObject("SELECT count(*) FROM posts WHERE user_id = ?::uuid", Integer.class,
				userId);
		assertThat(posts).isZero();
		assertThat(storage.objects()).isEmpty();
		assertThat(storage.deletedKeys()).hasSize(1);
	}

}
