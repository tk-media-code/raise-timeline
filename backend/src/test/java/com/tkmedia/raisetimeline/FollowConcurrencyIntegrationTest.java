package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
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
 * 同じ人が同じ相手を同時にフォローしても、両方が 204 で行は 1 つだけになることを確かめる。
 *
 * <p>{@code @Transactional} は付けない。別スレッドから要求を送るので、テストのトランザクションに閉じ込めると
 * 書き込みが見えなくなる。作った利用者は {@link #cleanUp()} で消す（フォローの行は外部キーの連鎖で消える）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FollowConcurrencyIntegrationTest {

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

	private record Account(String username, String userId, String token) {
	}

	private Account register() throws Exception {
		String username = "fl_" + UUID.randomUUID().toString().substring(0, 8);
		usernames.add(username);
		String body = "{\"username\":\"" + username + "\",\"displayName\":\"テスト\",\"email\":\"" + username
				+ "@example.com\",\"password\":\"" + PASSWORD + "\"}";
		MvcResult result = mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content(body)).andReturn();
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		String json = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
		return new Account(username, JsonPath.read(json, "$.user.id"), JsonPath.read(json, "$.accessToken"));
	}

	@Test
	@DisplayName("同じ人が同じ相手を同時に 2 回フォローしても、両方 204 で、follows は 1 行")
	void concurrentFollowsCreateOneRow() throws Exception {
		Account follower = register();
		Account followee = register();

		List<Integer> statuses = Concurrently.run(() -> sendFollow(follower, followee),
				() -> sendFollow(follower, followee));

		assertThat(statuses).containsExactly(204, 204);
		Integer rows = jdbc.queryForObject("SELECT count(*) FROM follows WHERE follower_id = ?::uuid AND followee_id = ?::uuid",
				Integer.class, follower.userId(), followee.userId());
		assertThat(rows).isEqualTo(1);
	}

	private int sendFollow(Account follower, Account followee) throws Exception {
		return mockMvc.perform(put("/api/users/{username}/follow", followee.username())
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + follower.token())).andReturn().getResponse().getStatus();
	}

}
