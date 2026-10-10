package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.logging.LogLines;
import com.tkmedia.raisetimeline.mapper.CommentMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * コメントの書く・読む・消すを、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>テストごとにロールバックする。存在しない投稿への POST は外部キー違反で PostgreSQL のトランザクションが
 * 中断するので、そのテストは要求を 1 回送って応答を見るだけにする（{@link LikeIntegrationTest} と同じ）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class CommentIntegrationTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 11, 12, 0, 0, 0, ZoneOffset.UTC);
	private static final String TOO_SHORT_OR_LONG = "1〜280 文字で入力してください";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private PostMapper postMapper;

	@Autowired
	private CommentMapper commentMapper;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private JsonMapper jsonMapper;

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

	private MvcResult write(UUID viewer, UUID postId, String body) throws Exception {
		return rawWrite(viewer, postId, jsonMapper.writeValueAsString(Map.of("body", body)));
	}

	private MvcResult rawWrite(UUID viewer, UUID postId, String jsonBody) throws Exception {
		return send(post("/api/posts/{id}/comments", postId).contentType(MediaType.APPLICATION_JSON)
				.content(jsonBody.getBytes(StandardCharsets.UTF_8)), viewer);
	}

	private MvcResult comments(UUID viewer, UUID postId, String cursor) throws Exception {
		var request = get("/api/posts/{id}/comments", postId);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return send(request, viewer);
	}

	private MvcResult remove(UUID viewer, String commentId) throws Exception {
		return send(delete("/api/comments/{id}", commentId), viewer);
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private static int statusOf(MvcResult result) {
		return result.getResponse().getStatus();
	}

	private int commentCountOfPost(UUID viewer, UUID postId) throws Exception {
		MvcResult result = send(get("/api/posts/{id}", postId), viewer);
		assertThat(statusOf(result)).isEqualTo(200);
		return JsonPath.read(json(result), "$.commentCount");
	}

	private int commentCountInTimeline(UUID viewer, UUID postId) throws Exception {
		MvcResult result = send(get("/api/timeline/all"), viewer);
		assertThat(statusOf(result)).isEqualTo(200);
		List<Integer> counts = JsonPath.read(json(result), "$.items[?(@.id == '" + postId + "')].commentCount");
		assertThat(counts).hasSize(1);
		return counts.get(0);
	}

	private int commentRows(UUID postId) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM comments WHERE post_id = ?", Integer.class, postId);
		return count == null ? 0 : count;
	}

	private void assertRejected(MvcResult result, String message) throws Exception {
		assertThat(statusOf(result)).isEqualTo(422);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("VALIDATION_ERROR");
		assertThat((String) JsonPath.read(json(result), "$.errors[0].field")).isEqualTo("body");
		assertThat((String) JsonPath.read(json(result), "$.errors[0].message")).isEqualTo(message);
	}

	@Test
	@DisplayName("書くと 201。body・author（自分）・createdAt が返り、email の鍵は無い")
	void writeReturns201() throws Exception {
		UUID post = createPost(other);

		MvcResult result = write(me, post, "はじめまして");

		assertThat(statusOf(result)).isEqualTo(201);
		String json = json(result);
		assertThat((String) JsonPath.read(json, "$.body")).isEqualTo("はじめまして");
		assertThat((String) JsonPath.read(json, "$.author.id")).isEqualTo(me.toString());
		assertThat((String) JsonPath.read(json, "$.author.displayName")).isEqualTo("表示名me");
		assertThat(JsonPath.<Object>read(json, "$.author.avatarUrl")).isNull();
		assertThat((String) JsonPath.read(json, "$.id")).isNotBlank();
		assertThat((String) JsonPath.read(json, "$.createdAt")).isNotBlank();
		assertThat(json).doesNotContain("email").doesNotContain("@example.com").doesNotContain("passwordHash");
	}

	@Test
	@DisplayName("書くと投稿の commentCount が 1 増え、消すと戻る。タイムラインの同じ投稿も同じ数")
	void commentCountFollowsWriteAndDelete() throws Exception {
		UUID post = createPost(other);
		assertThat(commentCountOfPost(me, post)).isZero();

		MvcResult written = write(me, post, "一件目");

		assertThat(statusOf(written)).isEqualTo(201);
		assertThat(commentCountOfPost(me, post)).isEqualTo(1);
		assertThat(commentCountInTimeline(me, post)).isEqualTo(1);

		assertThat(statusOf(remove(me, JsonPath.read(json(written), "$.id")))).isEqualTo(204);

		assertThat(commentCountOfPost(me, post)).isZero();
		assertThat(commentCountInTimeline(me, post)).isZero();
	}

	@Test
	@DisplayName("1 文字は 201。空と空白だけ（半角・全角・改行）は 422 で、errors[0] は body の「1〜280 文字で入力してください」")
	void shortBodies() throws Exception {
		UUID post = createPost(other);

		assertThat(statusOf(write(me, post, "あ"))).isEqualTo(201);

		assertRejected(write(me, post, ""), TOO_SHORT_OR_LONG);
		assertRejected(write(me, post, "  \n　"), TOO_SHORT_OR_LONG);
		assertRejected(rawWrite(me, post, "{}"), TOO_SHORT_OR_LONG);
		assertThat(commentRows(post)).isEqualTo(1);
	}

	@Test
	@DisplayName("280 文字は 201、281 文字は 422")
	void lengthBoundary() throws Exception {
		UUID post = createPost(other);

		assertThat(statusOf(write(me, post, "あ".repeat(280)))).isEqualTo(201);

		assertRejected(write(me, post, "あ".repeat(281)), TOO_SHORT_OR_LONG);
		assertThat(commentRows(post)).isEqualTo(1);
	}

	@Test
	@DisplayName("CRLF を含む 280 文字は 201 で、保存された本文の改行は LF")
	void crlfIsStoredAsLf() throws Exception {
		UUID post = createPost(other);
		String raw = "あ".repeat(139) + "\r\n" + "い".repeat(140);

		MvcResult result = write(me, post, raw);

		assertThat(statusOf(result)).isEqualTo(201);
		String expected = "あ".repeat(139) + "\n" + "い".repeat(140);
		assertThat((String) JsonPath.read(json(result), "$.body")).isEqualTo(expected);
		String stored = jdbc.queryForObject("SELECT body FROM comments WHERE id = ?::uuid", String.class,
				(String) JsonPath.read(json(result), "$.id"));
		assertThat(stored).isEqualTo(expected).doesNotContain("\r");
	}

	@Test
	@DisplayName("NUL を含むと 422 で、「使えない文字が含まれています」")
	void nulIsRejected() throws Exception {
		UUID post = createPost(other);

		MvcResult result = rawWrite(me, post, "{\"body\":\"a\\u0000b\"}");

		assertRejected(result, "使えない文字が含まれています");
		assertThat(commentRows(post)).isZero();
	}

	@Test
	@DisplayName("21 件書くと、1 ページ目は新しい 20 件で、nextCursor は 20 件目の id。続きは最初の 1 件で、重複しない")
	void pagesThroughComments() throws Exception {
		UUID post = createPost(other);
		List<UUID> ids = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			ids.add(commentMapper.insert(post, i % 2 == 0 ? me : other, "コメント" + i, NOW.plusSeconds(i)));
		}

		MvcResult first = comments(me, post, null);

		assertThat(statusOf(first)).isEqualTo(200);
		List<String> firstIds = JsonPath.read(json(first), "$.items[*].id");
		List<String> expectedFirst = new ArrayList<>();
		for (int i = 20; i >= 1; i--) {
			expectedFirst.add(ids.get(i).toString());
		}
		assertThat(firstIds).containsExactlyElementsOf(expectedFirst);
		String nextCursor = JsonPath.read(json(first), "$.nextCursor");
		assertThat(nextCursor).isEqualTo(ids.get(1).toString());

		MvcResult second = comments(me, post, nextCursor);

		assertThat(statusOf(second)).isEqualTo(200);
		List<String> secondIds = JsonPath.read(json(second), "$.items[*].id");
		assertThat(secondIds).containsExactly(ids.get(0).toString());
		assertThat(JsonPath.<Object>read(json(second), "$.nextCursor")).isNull();
		assertThat(firstIds).doesNotContainAnyElementsOf(secondIds);
	}

	@Test
	@DisplayName("0 件なら items は空、nextCursor は null")
	void emptyList() throws Exception {
		UUID post = createPost(other);

		MvcResult result = comments(me, post, null);

		assertThat(statusOf(result)).isEqualTo(200);
		assertThat(JsonPath.<List<Object>>read(json(result), "$.items")).isEmpty();
		assertThat(JsonPath.<Object>read(json(result), "$.nextCursor")).isNull();
	}

	@Test
	@DisplayName("無い投稿への POST と GET は 404 NOT_FOUND")
	void missingPostReturns404() throws Exception {
		UUID missing = UUID.randomUUID();

		MvcResult read = comments(me, missing, null);
		assertThat(statusOf(read)).isEqualTo(404);
		assertThat((String) JsonPath.read(json(read), "$.code")).isEqualTo("NOT_FOUND");

		// 外部キー違反でトランザクションが中断するので、この要求が最後。
		MvcResult written = write(me, missing, "本文");
		assertThat(statusOf(written)).isEqualTo(404);
		assertThat((String) JsonPath.read(json(written), "$.code")).isEqualTo("NOT_FOUND");
	}

	@Test
	@DisplayName("無いコメントの DELETE は 404 NOT_FOUND")
	void missingCommentReturns404() throws Exception {
		MvcResult result = remove(me, UUID.randomUUID().toString());

		assertThat(statusOf(result)).isEqualTo(404);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("NOT_FOUND");
	}

	@Test
	@DisplayName("他人のコメントを消すと 403 FORBIDDEN で、行は残る")
	void deletingOthersCommentReturns403() throws Exception {
		UUID post = createPost(other);
		UUID comment = commentMapper.insert(post, other, "他人のコメント", NOW);

		MvcResult result = remove(me, comment.toString());

		assertThat(statusOf(result)).isEqualTo(403);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("FORBIDDEN");
		assertThat(commentRows(post)).isEqualTo(1);
	}

	@Test
	@DisplayName("投稿の持ち主でも、他人のコメントを消すと 403 で、行は残る")
	void postOwnerCannotDeleteOthersComment() throws Exception {
		UUID post = createPost(me);
		UUID comment = commentMapper.insert(post, other, "他人のコメント", NOW);

		MvcResult result = remove(me, comment.toString());

		assertThat(statusOf(result)).isEqualTo(403);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("FORBIDDEN");
		assertThat(commentRows(post)).isEqualTo(1);
	}

	@Test
	@DisplayName("投稿を DELETE /api/posts/{id} で消すと、その投稿のコメントも消える")
	void deletingPostRemovesComments() throws Exception {
		UUID post = createPost(me);
		commentMapper.insert(post, other, "コメント", NOW);
		assertThat(commentRows(post)).isEqualTo(1);

		int status = statusOf(send(delete("/api/posts/{id}", post), me));

		assertThat(status).isEqualTo(204);
		assertThat(commentRows(post)).isZero();
	}

	@Test
	@DisplayName("削除の要求に comment.deleted の行が 1 本あり、user.id と app.comment.id が付き、本文はどの行にも出ない")
	void deleteWritesEvent(CapturedOutput output) throws Exception {
		UUID post = createPost(other);
		String body = "ログに出てはいけないコメント " + UUID.randomUUID();
		String id = JsonPath.read(json(write(me, post, body)), "$.id");

		MvcResult deleted = remove(me, id);

		assertThat(statusOf(deleted)).isEqualTo(204);
		String requestId = deleted.getResponse().getHeader("X-Request-Id");
		assertThat(requestId).isNotBlank();
		List<Map<String, Object>> mine = LogLines.parse(output).stream()
				.filter(line -> requestId.equals(LogLines.get(line, LogFields.HTTP_REQUEST_ID)))
				.toList();
		List<Map<String, Object>> events = LogLines.withAction(mine, LogEvents.COMMENT_DELETED);
		assertThat(events).hasSize(1);
		assertThat(LogLines.get(events.get(0), "log.level")).isEqualTo("INFO");
		assertThat(LogLines.get(events.get(0), "message")).isEqualTo("コメントを削除した");
		assertThat(LogLines.get(events.get(0), LogFields.APP_COMMENT_ID)).isEqualTo(id);
		assertThat(LogLines.get(events.get(0), LogFields.USER_ID)).isEqualTo(me.toString());
		assertThat(mine).isNotEmpty();
		assertThat(mine).noneSatisfy(line -> assertThat(line.toString()).contains(body));
	}

}
