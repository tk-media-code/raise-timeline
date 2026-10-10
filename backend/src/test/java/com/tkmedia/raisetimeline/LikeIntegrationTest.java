package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.mapper.LikeMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * いいねの付け外しと、いいねした人の一覧を、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>テストごとにロールバックする。存在しない投稿への付け外しは外部キー違反で PostgreSQL のトランザクションが
 * 中断するので、そのテストは要求を 1 回送って応答を見るだけにする。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class LikeIntegrationTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 10, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private PostMapper postMapper;

	@Autowired
	private LikeMapper likeMapper;

	@Autowired
	private JdbcTemplate jdbc;

	private UUID me;
	private UUID other;

	@BeforeEach
	void setUp() {
		me = createUser("me");
		other = createUser("other");
	}

	private UUID createUser(String prefix) {
		String s = UUID.randomUUID().toString().substring(0, 8);
		String username = prefix + "_" + s;
		return userMapper.insert(new User(null, username, "表示名" + prefix, username + "@example.com",
				"hash", "自己紹介" + prefix, null, NOW, NOW));
	}

	private UUID createPost(UUID userId) {
		return postMapper.insert(new Post(null, userId, "投稿", NOW, NOW));
	}

	private MvcResult send(MockHttpServletRequestBuilder request, UUID viewer) throws Exception {
		return mockMvc.perform(request.with(jwt().jwt(j -> j.subject(viewer.toString())))).andReturn();
	}

	private int like(UUID viewer, UUID postId) throws Exception {
		return send(put("/api/posts/{id}/like", postId), viewer).getResponse().getStatus();
	}

	private int unlike(UUID viewer, UUID postId) throws Exception {
		return send(delete("/api/posts/{id}/like", postId), viewer).getResponse().getStatus();
	}

	private MvcResult likes(UUID viewer, UUID postId, String cursor) throws Exception {
		var request = get("/api/posts/{id}/likes", postId);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return send(request, viewer);
	}

	private String postJson(UUID viewer, UUID postId) throws Exception {
		MvcResult result = send(get("/api/posts/{id}", postId), viewer);
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		return json(result);
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private int likeRows(UUID postId) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM likes WHERE post_id = ?", Integer.class, postId);
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("付けると 204。GET /api/posts/{id} の likeCount が 1、likedByMe が true")
	void likeShowsInPost() throws Exception {
		UUID post = createPost(other);

		assertThat(like(me, post)).isEqualTo(204);

		String json = postJson(me, post);
		assertThat((Integer) JsonPath.read(json, "$.likeCount")).isEqualTo(1);
		assertThat((Boolean) JsonPath.read(json, "$.likedByMe")).isTrue();
	}

	@Test
	@DisplayName("2 回付けても 204 で、likes は 1 行")
	void likeTwiceKeepsOneRow() throws Exception {
		UUID post = createPost(other);

		assertThat(like(me, post)).isEqualTo(204);
		assertThat(like(me, post)).isEqualTo(204);

		assertThat(likeRows(post)).isEqualTo(1);
	}

	@Test
	@DisplayName("外すと 204 で、likeCount 0・likedByMe false。付けていない投稿を外しても 204")
	void unlikeRemovesAndIsIdempotent() throws Exception {
		UUID post = createPost(other);
		assertThat(like(me, post)).isEqualTo(204);

		assertThat(unlike(me, post)).isEqualTo(204);

		String json = postJson(me, post);
		assertThat((Integer) JsonPath.read(json, "$.likeCount")).isZero();
		assertThat((Boolean) JsonPath.read(json, "$.likedByMe")).isFalse();
		assertThat(unlike(me, post)).isEqualTo(204);
	}

	@Test
	@DisplayName("自分の投稿にも付けられる")
	void canLikeOwnPost() throws Exception {
		UUID post = createPost(me);

		assertThat(like(me, post)).isEqualTo(204);

		assertThat((Integer) JsonPath.read(postJson(me, post), "$.likeCount")).isEqualTo(1);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "PUT", "DELETE", "GET" })
	@DisplayName("無い投稿への PUT・DELETE・GET likes は 404 NOT_FOUND")
	void missingPostReturns404(String method) throws Exception {
		UUID missing = UUID.randomUUID();
		var request = switch (method) {
			case "PUT" -> put("/api/posts/{id}/like", missing);
			case "DELETE" -> delete("/api/posts/{id}/like", missing);
			case "GET" -> get("/api/posts/{id}/likes", missing);
			default -> throw new IllegalArgumentException(method);
		};

		MvcResult result = send(request, me);

		assertThat(result.getResponse().getStatus()).isEqualTo(404);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("NOT_FOUND");
	}

	@Test
	@DisplayName("一覧が 0 件なら items は空、nextCursor は null")
	void emptyList() throws Exception {
		UUID post = createPost(other);

		MvcResult result = likes(me, post, null);

		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		assertThat(JsonPath.<List<Object>>read(json(result), "$.items")).isEmpty();
		assertThat(JsonPath.<Object>read(json(result), "$.nextCursor")).isNull();
	}

	@Test
	@DisplayName("21 人が付けると、1 ページ目は後に付けた 20 人で、nextCursor は 20 件目の likes.id。続きは最初の 1 人で、重複しない")
	void pagesThroughLikers() throws Exception {
		UUID post = createPost(other);
		List<UUID> likers = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			UUID liker = createUser("liker");
			likers.add(liker);
			likeMapper.insert(post, liker);
		}

		MvcResult first = likes(me, post, null);

		assertThat(first.getResponse().getStatus()).isEqualTo(200);
		List<String> firstIds = JsonPath.read(json(first), "$.items[*].id");
		List<String> expectedFirst = new ArrayList<>();
		for (int i = 20; i >= 1; i--) {
			expectedFirst.add(likers.get(i).toString());
		}
		assertThat(firstIds).containsExactlyElementsOf(expectedFirst);
		// 20 件目（= 後から数えて 20 番目に付けた人）の likes.id
		String twentiethLikeId = jdbc.queryForObject("SELECT id::text FROM likes WHERE post_id = ? AND user_id = ?",
				String.class, post, likers.get(1));
		String nextCursor = JsonPath.read(json(first), "$.nextCursor");
		assertThat(nextCursor).isEqualTo(twentiethLikeId);

		MvcResult second = likes(me, post, nextCursor);

		List<String> secondIds = JsonPath.read(json(second), "$.items[*].id");
		assertThat(secondIds).containsExactly(likers.get(0).toString());
		assertThat(JsonPath.<Object>read(json(second), "$.nextCursor")).isNull();
	}

	@Test
	@DisplayName("一覧の項目に email が無く、isFollowing は false")
	void cardHasNoEmail() throws Exception {
		UUID post = createPost(other);
		assertThat(like(other, post)).isEqualTo(204);

		String json = json(likes(me, post, null));

		assertThat(json).doesNotContain("email").doesNotContain("@example.com").doesNotContain("passwordHash");
		assertThat((Boolean) JsonPath.read(json, "$.items[0].isFollowing")).isFalse();
		assertThat((String) JsonPath.read(json, "$.items[0].id")).isEqualTo(other.toString());
		assertThat((String) JsonPath.read(json, "$.items[0].bio")).isEqualTo("自己紹介other");
	}

	@Test
	@DisplayName("投稿を DELETE /api/posts/{id} で消すと、その投稿の likes の行も消える")
	void deletingPostRemovesLikes() throws Exception {
		UUID post = createPost(me);
		assertThat(like(other, post)).isEqualTo(204);
		assertThat(likeRows(post)).isEqualTo(1);

		int status = send(delete("/api/posts/{id}", post), me).getResponse().getStatus();

		assertThat(status).isEqualTo(204);
		assertThat(likeRows(post)).isZero();
	}

}
