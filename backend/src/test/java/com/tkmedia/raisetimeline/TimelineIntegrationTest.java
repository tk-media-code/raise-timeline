package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * タイムライン「すべて」を、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>テストごとにロールバックするので、投稿の id は 1 つのトランザクションの中で採番される。
 * 先頭で {@code DELETE FROM posts} を実行し、他のテストが残した行が一覧に混ざらないようにする。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TimelineIntegrationTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 9, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private PostMapper postMapper;

	@Autowired
	private JdbcTemplate jdbc;

	private UUID me;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM posts");
		me = createUser("me");
	}

	private UUID createUser(String prefix) {
		String s = UUID.randomUUID().toString().substring(0, 8);
		String username = prefix + "_" + s;
		return userMapper.insert(new User(null, username, "表示名" + prefix, username + "@example.com",
				"hash", "", null, NOW, NOW));
	}

	/** 作った順（古い順）に id を返す。 */
	private List<UUID> createPosts(UUID userId, int count) {
		List<UUID> ids = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			ids.add(postMapper.insert(new Post(null, userId, "投稿" + i, NOW, NOW)));
		}
		return ids;
	}

	private MvcResult timeline(String cursor) throws Exception {
		var request = get("/api/timeline/all").with(jwt().jwt(j -> j.subject(me.toString())));
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		MvcResult result = mockMvc.perform(request).andReturn();
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		return result;
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private static List<String> idsOf(MvcResult result) throws Exception {
		return JsonPath.read(json(result), "$.items[*].id");
	}

	private static String nextCursorOf(MvcResult result) throws Exception {
		return JsonPath.read(json(result), "$.nextCursor");
	}

	@Test
	@DisplayName("投稿が 0 件なら、items は空で nextCursor は null")
	void emptyTimeline() throws Exception {
		MvcResult page = timeline(null);

		assertThat(idsOf(page)).isEmpty();
		assertThat(nextNull(page)).isTrue();
	}

	@Test
	@DisplayName("ちょうど 20 件なら、20 件が返り nextCursor は null")
	void exactly20() throws Exception {
		createPosts(me, 20);

		MvcResult page = timeline(null);

		assertThat(idsOf(page)).hasSize(20);
		assertThat(nextNull(page)).isTrue();
	}

	@Test
	@DisplayName("21 件は 2 ページに分かれ、重複なく id の降順に並ぶ")
	void twentyOneSpansTwoPages() throws Exception {
		createPosts(me, 21);

		MvcResult first = timeline(null);
		List<String> firstIds = idsOf(first);
		assertThat(firstIds).hasSize(20);
		assertThat(nextCursorOf(first)).isEqualTo(firstIds.get(19));

		MvcResult second = timeline(nextCursorOf(first));
		List<String> secondIds = idsOf(second);
		assertThat(secondIds).hasSize(1);
		assertThat(nextNull(second)).isTrue();

		List<String> all = new ArrayList<>(firstIds);
		all.addAll(secondIds);
		assertThat(all).doesNotHaveDuplicates();
		assertThat(all).isSortedAccordingTo(Comparator.<String>naturalOrder().reversed());
	}

	@Test
	@DisplayName("1 ページ目を読んだあとに投稿が増えても、2 ページ目は古い 5 件ちょうど")
	void newPostDoesNotShiftNextPage() throws Exception {
		List<UUID> created = createPosts(me, 25);
		MvcResult first = timeline(null);

		createPosts(me, 1);
		MvcResult second = timeline(nextCursorOf(first));

		List<String> expected = created.subList(0, 5).reversed().stream().map(UUID::toString).toList();
		assertThat(idsOf(second)).containsExactlyElementsOf(expected);
		assertThat(nextNull(second)).isTrue();
	}

	@Test
	@DisplayName("nextCursor の投稿が消えても、2 ページ目は残りの古い 5 件")
	void deletedCursorPost() throws Exception {
		List<UUID> created = createPosts(me, 25);
		MvcResult first = timeline(null);
		String cursor = nextCursorOf(first);

		postMapper.delete(UUID.fromString(cursor));
		MvcResult second = timeline(cursor);

		List<String> expected = created.subList(0, 5).reversed().stream().map(UUID::toString).toList();
		assertThat(idsOf(second)).containsExactlyElementsOf(expected);
		assertThat(nextNull(second)).isTrue();
	}

	@Test
	@DisplayName("2 人の投稿が両方出て、投稿者が正しく、メールアドレスは出ない")
	void includesEveryonesPosts() throws Exception {
		UUID other = createUser("oth");
		UUID mine = createPosts(me, 1).get(0);
		UUID theirs = createPosts(other, 1).get(0);

		MvcResult page = timeline(null);

		String json = json(page);
		assertThat(idsOf(page)).containsExactly(theirs.toString(), mine.toString());
		assertThat((String) JsonPath.read(json, "$.items[0].author.id")).isEqualTo(other.toString());
		assertThat((String) JsonPath.read(json, "$.items[1].author.id")).isEqualTo(me.toString());
		assertThat((String) JsonPath.read(json, "$.items[0].author.username"))
				.isEqualTo(userMapper.findById(other).orElseThrow().username());
		assertThat(JsonPath.<Object>read(json, "$.items[0].author").toString()).doesNotContain("email");
	}

	private static boolean nextNull(MvcResult result) throws Exception {
		return JsonPath.read(json(result), "$.nextCursor") == null;
	}

}
