package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
 * 同じ人が同じ投稿に同時にいいねを付けても、両方が 204 で行は 1 つだけになることを確かめる。
 *
 * <p>{@code @Transactional} は付けない。別スレッドから要求を送るので、テストのトランザクションに閉じ込めると
 * 書き込みが見えなくなる。作った利用者は {@link #cleanUp()} で消す（投稿・いいねは外部キーの連鎖で消える）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LikeConcurrencyIntegrationTest {

	private static final String PASSWORD = "Passw0rd!secret";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PostMapper postMapper;

	private final List<String> usernames = new ArrayList<>();

	@AfterEach
	void cleanUp() {
		for (String username : usernames) {
			jdbc.update("DELETE FROM users WHERE lower(username) = lower(?)", username);
		}
	}

	private record Account(String userId, String token) {
	}

	private Account register() throws Exception {
		String username = "lk_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(username);
		String body = "{\"username\":\"" + username + "\",\"displayName\":\"テスト\",\"email\":\"" + username
				+ "@example.com\",\"password\":\"" + PASSWORD + "\"}";
		MvcResult result = mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content(body)).andReturn();
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		String json = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
		return new Account(JsonPath.read(json, "$.user.id"), JsonPath.read(json, "$.accessToken"));
	}

	@Test
	@DisplayName("同じ人が同じ投稿に同時に 2 回付けても、両方 204 で、likes は 1 行")
	void concurrentLikesCreateOneRow() throws Exception {
		Account liker = register();
		Account owner = register();
		UUID postId = postMapper.insert(new Post(null, UUID.fromString(owner.userId()), "投稿",
				OffsetDateTime.of(2026, 10, 10, 12, 0, 0, 0, ZoneOffset.UTC),
				OffsetDateTime.of(2026, 10, 10, 12, 0, 0, 0, ZoneOffset.UTC)));

		List<Integer> statuses = Concurrently.run(() -> sendLike(liker, postId), () -> sendLike(liker, postId));

		assertThat(statuses).containsExactly(204, 204);
		Integer rows = jdbc.queryForObject("SELECT count(*) FROM likes WHERE post_id = ?", Integer.class, postId);
		assertThat(rows).isEqualTo(1);
	}

	private int sendLike(Account liker, UUID postId) throws Exception {
		return mockMvc.perform(put("/api/posts/{id}/like", postId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + liker.token())).andReturn().getResponse().getStatus();
	}

}
