package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.mapper.FollowMapper;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.net.URI;
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
 * フォローと解除、フォロワーとフォロー中の一覧を、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>テストごとにロールバックする。存在しない相手には、サービスが先に名前で引いて 404 にするので、
 * 外部キー違反でトランザクションが中断することはない（その競合は {@code FollowServiceTest} が確かめる）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class FollowIntegrationTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 11, 12, 0, 0, 0, ZoneOffset.UTC);
	private static final String SELF_MESSAGE = "自分自身はフォローできません";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private FollowMapper followMapper;

	@Autowired
	private JdbcTemplate jdbc;

	private record Person(UUID id, String username) {
	}

	private Person me;
	private Person alice;
	private Person bob;

	@BeforeEach
	void setUp() {
		me = createUser("me");
		alice = createUser("alice");
		bob = createUser("bob");
	}

	private Person createUser(String prefix) {
		String s = UUID.randomUUID().toString().substring(0, 8);
		String username = prefix + "_" + s;
		UUID id = userMapper.insert(new User(null, username, "表示名" + prefix, username + "@example.com",
				"hash", "自己紹介" + prefix, null, NOW, NOW));
		return new Person(id, username);
	}

	private MvcResult send(MockHttpServletRequestBuilder request, Person viewer) throws Exception {
		return mockMvc.perform(request.with(jwt().jwt(j -> j.subject(viewer.id().toString())))).andReturn();
	}

	private int follow(Person viewer, String username) throws Exception {
		return send(put("/api/users/{username}/follow", username), viewer).getResponse().getStatus();
	}

	private int unfollow(Person viewer, String username) throws Exception {
		return send(delete("/api/users/{username}/follow", username), viewer).getResponse().getStatus();
	}

	private MvcResult list(Person viewer, String username, String kind, String cursor) throws Exception {
		var request = get("/api/users/{username}/" + kind, username);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return send(request, viewer);
	}

	private String profile(Person viewer, String username) throws Exception {
		MvcResult result = send(get("/api/users/{username}", username), viewer);
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		return json(result);
	}

	private String meJson(Person viewer) throws Exception {
		MvcResult result = send(get("/api/users/me"), viewer);
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		return json(result);
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private int followRows(Person follower, Person followee) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM follows WHERE follower_id = ? AND followee_id = ?",
				Integer.class, follower.id(), followee.id());
		return count == null ? 0 : count;
	}

	private int followRowsOf(Person person) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM follows WHERE follower_id = ? OR followee_id = ?",
				Integer.class, person.id(), person.id());
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("フォローすると 204。GET /api/users/alice は isFollowing true・followersCount 1、"
			+ "自分のプロフィール（/api/users/{me} と /api/users/me）は followingCount 1")
	void followShowsInProfiles() throws Exception {
		assertThat(follow(me, alice.username())).isEqualTo(204);

		String aliceJson = profile(me, alice.username());
		assertThat((Boolean) JsonPath.read(aliceJson, "$.isFollowing")).isTrue();
		assertThat((Integer) JsonPath.read(aliceJson, "$.followersCount")).isEqualTo(1);
		assertThat((Integer) JsonPath.read(aliceJson, "$.followingCount")).isZero();
		String myProfile = profile(me, me.username());
		assertThat((Integer) JsonPath.read(myProfile, "$.followingCount")).isEqualTo(1);
		assertThat((Integer) JsonPath.read(myProfile, "$.followersCount")).isZero();
		assertThat((Boolean) JsonPath.read(myProfile, "$.isFollowing")).isFalse();
		String meJson = meJson(me);
		assertThat((Integer) JsonPath.read(meJson, "$.followingCount")).isEqualTo(1);
		assertThat((Integer) JsonPath.read(meJson, "$.followersCount")).isZero();
		assertThat((Boolean) JsonPath.read(meJson, "$.isFollowing")).isFalse();
	}

	@Test
	@DisplayName("解除すると 204 で、プロフィールの isFollowing と数が戻る。自分のプロフィール（/api/users/{me} と /api/users/me）の followingCount も減る")
	void unfollowRestoresProfiles() throws Exception {
		assertThat(follow(me, alice.username())).isEqualTo(204);
		assertThat((Integer) JsonPath.read(profile(me, me.username()), "$.followingCount")).isEqualTo(1);

		assertThat(unfollow(me, alice.username())).isEqualTo(204);

		String aliceJson = profile(me, alice.username());
		assertThat((Boolean) JsonPath.read(aliceJson, "$.isFollowing")).isFalse();
		assertThat((Integer) JsonPath.read(aliceJson, "$.followersCount")).isZero();
		assertThat((Integer) JsonPath.read(profile(me, me.username()), "$.followingCount")).isZero();
		assertThat((Integer) JsonPath.read(meJson(me), "$.followingCount")).isZero();
		assertThat(followRows(me, alice)).isZero();
	}

	@Test
	@DisplayName("2 回フォローしても行は 1 つで、2 回目も 204。フォローしていない人の解除も 204")
	void followAndUnfollowAreIdempotent() throws Exception {
		assertThat(follow(me, alice.username())).isEqualTo(204);
		assertThat(follow(me, alice.username())).isEqualTo(204);

		assertThat(followRows(me, alice)).isEqualTo(1);
		assertThat(unfollow(me, bob.username())).isEqualTo(204);
		assertThat(unfollow(me, alice.username())).isEqualTo(204);
		assertThat(unfollow(me, alice.username())).isEqualTo(204);
		assertThat(followRowsOf(me)).isZero();
	}

	@Test
	@DisplayName("自分自身のフォローは 422 VALIDATION_ERROR で、errors[0] は username の 自分自身はフォローできません。行は増えない")
	void followSelfIsRejected() throws Exception {
		MvcResult result = send(put("/api/users/{username}/follow", me.username()), me);

		assertThat(result.getResponse().getStatus()).isEqualTo(422);
		String json = json(result);
		assertThat((String) JsonPath.read(json, "$.code")).isEqualTo("VALIDATION_ERROR");
		assertThat((String) JsonPath.read(json, "$.errors[0].field")).isEqualTo("username");
		assertThat((String) JsonPath.read(json, "$.errors[0].message")).isEqualTo(SELF_MESSAGE);
		assertThat(followRowsOf(me)).isZero();
	}

	@Test
	@DisplayName("大文字のユーザー名で自分自身をフォローしても 422 で、行は増えない")
	void followSelfWithUpperCaseIsRejected() throws Exception {
		assertThat(follow(me, me.username().toUpperCase())).isEqualTo(422);

		assertThat(followRowsOf(me)).isZero();
	}

	@Test
	@DisplayName("自分自身の解除は 204 で、何も起きない")
	void unfollowSelfIsNoop() throws Exception {
		assertThat(unfollow(me, me.username())).isEqualTo(204);
	}

	@Test
	@DisplayName("存在しないユーザー名は、フォロー・解除・フォロワー・フォロー中の 4 つとも 404 NOT_FOUND")
	void unknownUsernameIsNotFound() throws Exception {
		String ghost = "ghost_" + UUID.randomUUID().toString().substring(0, 8);

		MvcResult put = send(put("/api/users/{username}/follow", ghost), me);
		MvcResult del = send(delete("/api/users/{username}/follow", ghost), me);
		assertThat(put.getResponse().getStatus()).isEqualTo(404);
		assertThat(del.getResponse().getStatus()).isEqualTo(404);
		assertThat((String) JsonPath.read(json(put), "$.code")).isEqualTo("NOT_FOUND");
		assertThat((String) JsonPath.read(json(del), "$.code")).isEqualTo("NOT_FOUND");
		MvcResult followers = list(me, ghost, "followers", null);
		MvcResult following = list(me, ghost, "following", null);
		assertThat(followers.getResponse().getStatus()).isEqualTo(404);
		assertThat(following.getResponse().getStatus()).isEqualTo(404);
		assertThat((String) JsonPath.read(json(followers), "$.code")).isEqualTo("NOT_FOUND");
		assertThat((String) JsonPath.read(json(following), "$.code")).isEqualTo("NOT_FOUND");
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "aaaaaaaaaaaaaaaaaaaaa", "%E6%97%A5%E6%9C%AC%E8%AA%9E", "a%20b" })
	@DisplayName("規則に合わない名前（21 文字・日本語・空白）は 4 つとも 404 NOT_FOUND")
	void malformedUsernameIsNotFound(String username) throws Exception {
		List<MockHttpServletRequestBuilder> requests = List.of(
				put(URI.create("/api/users/" + username + "/follow")),
				delete(URI.create("/api/users/" + username + "/follow")),
				get(URI.create("/api/users/" + username + "/followers")),
				get(URI.create("/api/users/" + username + "/following")));

		for (MockHttpServletRequestBuilder request : requests) {
			MvcResult result = send(request, me);
			assertThat(result.getResponse().getStatus()).isEqualTo(404);
			assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("NOT_FOUND");
		}
	}

	@Test
	@DisplayName("NUL（%00）を含む名前は、Spring Security のファイアウォールが手前で 400 にし、500 にならない")
	void nulUsernameNeverReachesDatabase() throws Exception {
		int status = send(put(URI.create("/api/users/a%00b/follow")), me).getResponse().getStatus();

		assertThat(status).isEqualTo(400);
	}

	@Test
	@DisplayName("大文字のユーザー名（ALICE）でもフォローでき、alice のフォロワー一覧に出る。一覧も大文字で引ける")
	void usernameIsCaseInsensitive() throws Exception {
		assertThat(follow(me, alice.username().toUpperCase())).isEqualTo(204);

		assertThat(followRows(me, alice)).isEqualTo(1);
		String json = json(list(bob, alice.username(), "followers", null));
		assertThat(JsonPath.<List<String>>read(json, "$.items[*].id")).containsExactly(me.id().toString());
		String upper = json(list(bob, alice.username().toUpperCase(), "followers", null));
		assertThat(JsonPath.<List<String>>read(upper, "$.items[*].id")).containsExactly(me.id().toString());
		assertThat(unfollow(me, alice.username().toUpperCase())).isEqualTo(204);
		assertThat(followRows(me, alice)).isZero();
	}

	@Test
	@DisplayName("向きがある: me が alice をフォローしても、alice のフォロー中一覧は空で、alice から見た me の isFollowing は false")
	void followIsDirected() throws Exception {
		assertThat(follow(me, alice.username())).isEqualTo(204);

		String following = json(list(me, alice.username(), "following", null));
		assertThat(JsonPath.<List<Object>>read(following, "$.items")).isEmpty();
		assertThat((Boolean) JsonPath.read(profile(alice, me.username()), "$.isFollowing")).isFalse();
		assertThat((Integer) JsonPath.read(profile(alice, alice.username()), "$.followingCount")).isZero();
	}

	@Test
	@DisplayName("フォロワー一覧に、フォローした人が新しい順に UserCard で返る（email の鍵は無い）。フォロー中一覧も同じ")
	void listsReturnCardsNewestFirst() throws Exception {
		assertThat(follow(me, alice.username())).isEqualTo(204);
		assertThat(follow(bob, alice.username())).isEqualTo(204);
		assertThat(follow(alice, me.username())).isEqualTo(204);
		assertThat(follow(alice, bob.username())).isEqualTo(204);

		String followers = json(list(me, alice.username(), "followers", null));
		assertThat(JsonPath.<List<String>>read(followers, "$.items[*].id"))
				.containsExactly(bob.id().toString(), me.id().toString());
		assertThat((String) JsonPath.read(followers, "$.items[0].username")).isEqualTo(bob.username());
		assertThat((String) JsonPath.read(followers, "$.items[0].displayName")).isEqualTo("表示名bob");
		assertThat((String) JsonPath.read(followers, "$.items[0].bio")).isEqualTo("自己紹介bob");
		assertThat(followers).doesNotContain("email").doesNotContain("@example.com").doesNotContain("passwordHash");
		assertThat(JsonPath.<Object>read(followers, "$.nextCursor")).isNull();

		String following = json(list(me, alice.username(), "following", null));
		assertThat(JsonPath.<List<String>>read(following, "$.items[*].id"))
				.containsExactly(bob.id().toString(), me.id().toString());
		assertThat(following).doesNotContain("email").doesNotContain("@example.com").doesNotContain("passwordHash");
		assertThat(JsonPath.<Object>read(following, "$.nextCursor")).isNull();
	}

	@Test
	@DisplayName("一覧の isFollowing は、見ている人がその行の人をフォローしているか（相手が自分をフォローしているかではない）")
	void listIsFollowingIsFromViewerPointOfView() throws Exception {
		Person carol = createUser("carol");
		assertThat(follow(bob, alice.username())).isEqualTo(204);
		assertThat(follow(carol, alice.username())).isEqualTo(204);
		assertThat(follow(me, bob.username())).isEqualTo(204);
		// carol は me をフォローしているが、me は carol をフォローしていない
		assertThat(follow(carol, me.username())).isEqualTo(204);

		String followers = json(list(me, alice.username(), "followers", null));
		assertThat(JsonPath.<List<String>>read(followers, "$.items[*].id"))
				.containsExactly(carol.id().toString(), bob.id().toString());
		assertThat(JsonPath.<List<Boolean>>read(followers, "$.items[*].isFollowing")).containsExactly(false, true);

		assertThat(follow(carol, bob.username())).isEqualTo(204);
		String following = json(list(me, carol.username(), "following", null));
		assertThat(JsonPath.<List<String>>read(following, "$.items[*].id"))
				.containsExactly(bob.id().toString(), me.id().toString(), alice.id().toString());
		// me は bob だけをフォローしている。自分自身の行も、自分をフォローしていないので false
		assertThat(JsonPath.<List<Boolean>>read(following, "$.items[*].isFollowing"))
				.containsExactly(true, false, false);
	}

	@Test
	@DisplayName("21 人にフォローされると、1 ページ目は 20 人で nextCursor は 20 件目の follows.id。続きは最初の 1 人で、重複しない")
	void followersPageThrough() throws Exception {
		List<UUID> followers = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			Person follower = createUser("f");
			followMapper.insert(follower.id(), alice.id());
			followers.add(follower.id());
		}
		List<String> followIds = jdbc.queryForList(
				"SELECT id::text FROM follows WHERE followee_id = ? ORDER BY id DESC", String.class, alice.id());

		String first = json(list(me, alice.username(), "followers", null));

		List<String> firstIds = JsonPath.read(first, "$.items[*].id");
		assertThat(firstIds).hasSize(20);
		assertThat(firstIds).containsExactlyElementsOf(
				followers.reversed().subList(0, 20).stream().map(UUID::toString).toList());
		String nextCursor = JsonPath.read(first, "$.nextCursor");
		assertThat(nextCursor).isEqualTo(followIds.get(19));
		String second = json(list(me, alice.username(), "followers", nextCursor));
		List<String> secondIds = JsonPath.read(second, "$.items[*].id");
		assertThat(secondIds).containsExactly(followers.get(0).toString());
		assertThat(JsonPath.<Object>read(second, "$.nextCursor")).isNull();
		assertThat(firstIds).doesNotContainAnyElementsOf(secondIds);
	}

	@Test
	@DisplayName("フォロワー一覧で nextCursor の行の人が解除しても、続きは欠けも重複も無く最初の 1 人だけ")
	void followersCursorRowRemoved() throws Exception {
		List<Person> followers = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			Person follower = createUser("f");
			followMapper.insert(follower.id(), alice.id());
			followers.add(follower);
		}
		String first = json(list(me, alice.username(), "followers", null));
		List<String> firstIds = JsonPath.read(first, "$.items[*].id");
		String nextCursor = JsonPath.read(first, "$.nextCursor");
		Person cursorPerson = followers.reversed().get(19);
		assertThat(firstIds.get(19)).isEqualTo(cursorPerson.id().toString());

		assertThat(unfollow(cursorPerson, alice.username())).isEqualTo(204);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM follows WHERE id = ?::uuid", Integer.class, nextCursor))
				.isZero();
		String second = json(list(me, alice.username(), "followers", nextCursor));

		assertThat(JsonPath.<List<String>>read(second, "$.items[*].id"))
				.containsExactly(followers.get(0).id().toString());
		assertThat(JsonPath.<Object>read(second, "$.nextCursor")).isNull();
	}

	@Test
	@DisplayName("フォロー中一覧で nextCursor の行の相手を解除しても、続きは欠けも重複も無く最初の 1 人だけ")
	void followingCursorRowRemoved() throws Exception {
		List<Person> followees = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			Person followee = createUser("g");
			followMapper.insert(alice.id(), followee.id());
			followees.add(followee);
		}
		String first = json(list(me, alice.username(), "following", null));
		List<String> firstIds = JsonPath.read(first, "$.items[*].id");
		String nextCursor = JsonPath.read(first, "$.nextCursor");
		Person cursorPerson = followees.reversed().get(19);
		assertThat(firstIds.get(19)).isEqualTo(cursorPerson.id().toString());

		assertThat(unfollow(alice, cursorPerson.username())).isEqualTo(204);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM follows WHERE id = ?::uuid", Integer.class, nextCursor))
				.isZero();
		String second = json(list(me, alice.username(), "following", nextCursor));

		assertThat(JsonPath.<List<String>>read(second, "$.items[*].id"))
				.containsExactly(followees.get(0).id().toString());
		assertThat(JsonPath.<Object>read(second, "$.nextCursor")).isNull();
	}

	@Test
	@DisplayName("0 人なら items は空、nextCursor は null")
	void emptyLists() throws Exception {
		for (String kind : List.of("followers", "following")) {
			String json = json(list(me, alice.username(), kind, null));

			assertThat(JsonPath.<List<Object>>read(json, "$.items")).isEmpty();
			assertThat(JsonPath.<Object>read(json, "$.nextCursor")).isNull();
		}
	}

}
