package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

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
 * ユーザー検索（{@code GET /api/users}）を、本物の PostgreSQL（テスト専用 DB）に対して端から端まで確かめる。
 *
 * <p>テストごとにロールバックする。中断した実行や別のテストの行が残っていても結果に混ざらないよう、
 * 作る利用者の名前にも、探す語にも、テストごとの乱数 {@code s} を含める（{@code %}・{@code _}・{@code \} の語も同じ）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class UserSearchIntegrationTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 11, 12, 0, 0, 0, ZoneOffset.UTC);
	private static final String REQUIRED = "検索する語を入力してください";
	private static final String TOO_LONG = "50 文字以内で入力してください";
	private static final String UNUSABLE = "使えない文字が含まれています";

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

	/** このテストだけの乱数。ユーザー名にも探す語にも含める。 */
	private String s;
	private Person me;

	@BeforeEach
	void setUp() {
		s = UUID.randomUUID().toString().substring(0, 8);
		me = createUser("me_" + s, "自分" + s);
	}

	private Person createUser(String username, String displayName) {
		UUID id = userMapper.insert(new User(null, username, displayName, username + "@example.com",
				"hash", "自己紹介" + username, null, NOW, NOW));
		return new Person(id, username);
	}

	private MvcResult send(MockHttpServletRequestBuilder request) throws Exception {
		return mockMvc.perform(request.with(jwt().jwt(j -> j.subject(me.id().toString())))).andReturn();
	}

	private MvcResult search(String q) throws Exception {
		return send(get("/api/users").param("q", q));
	}

	private MvcResult search(String q, String cursor) throws Exception {
		return send(get("/api/users").param("q", q).param("cursor", cursor));
	}

	private static String json(MvcResult result) throws Exception {
		return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	/** 200 を確かめたうえで、items の id を返す。 */
	private List<String> ids(MvcResult result) throws Exception {
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		return JsonPath.read(json(result), "$.items[*].id");
	}

	private void assertValidationError(MvcResult result, String message) throws Exception {
		assertThat(result.getResponse().getStatus()).isEqualTo(422);
		String body = json(result);
		assertThat((String) JsonPath.read(body, "$.code")).isEqualTo("VALIDATION_ERROR");
		assertThat((String) JsonPath.read(body, "$.errors[0].field")).isEqualTo("q");
		assertThat((String) JsonPath.read(body, "$.errors[0].message")).isEqualTo(message);
	}

	@Test
	@DisplayName("ユーザー名の一部で返る")
	void matchesPartOfUsername() throws Exception {
		Person alice = createUser("alice_" + s, "アリス");

		assertThat(ids(search("lice_" + s))).containsExactly(alice.id().toString());
	}

	@Test
	@DisplayName("表示名の一部で返る")
	void matchesPartOfDisplayName() throws Exception {
		Person hanako = createUser("hanako_" + s, "山田花子" + s);

		assertThat(ids(search("花子" + s))).containsExactly(hanako.id().toString());
	}

	@Test
	@DisplayName("ALI で alice が返る（大文字の語で小文字の名前）")
	void isCaseInsensitive() throws Exception {
		Person alice = createUser("ali" + s + "ce", "アリス");

		assertThat(ids(search(("ALI" + s).toUpperCase()))).containsExactly(alice.id().toString());
	}

	@Test
	@DisplayName("自分も結果に出る")
	void includesSelf() throws Exception {
		assertThat(ids(search(s))).containsExactly(me.id().toString());
	}

	@Test
	@DisplayName("フォローしている人の isFollowing が true、ほかは false")
	void showsIsFollowing() throws Exception {
		Person alice = createUser("alice_" + s, "アリス");
		Person bob = createUser("bob_" + s, "ボブ");
		followMapper.insert(me.id(), alice.id());

		MvcResult result = search(s);

		List<String> ids = ids(result);
		List<Boolean> flags = JsonPath.read(json(result), "$.items[*].isFollowing");
		assertThat(ids).containsExactlyInAnyOrder(me.id().toString(), alice.id().toString(), bob.id().toString());
		assertThat(flags.get(ids.indexOf(alice.id().toString()))).isTrue();
		assertThat(flags.get(ids.indexOf(bob.id().toString()))).isFalse();
		assertThat(flags.get(ids.indexOf(me.id().toString()))).isFalse();
	}

	@Test
	@DisplayName("q が無いと 422 で『検索する語を入力してください』")
	void missingQueryIs422() throws Exception {
		assertValidationError(send(get("/api/users")), REQUIRED);
	}

	@ParameterizedTest(name = "[{0}]")
	@ValueSource(strings = { "", " ", "   ", "　", "　 　" })
	@DisplayName("q が空・空白だけ・全角空白だけなら 422 で『検索する語を入力してください』")
	void blankQueryIs422(String q) throws Exception {
		assertValidationError(search(q), REQUIRED);
	}

	@Test
	@DisplayName("1 文字は 200")
	void oneCharacterIsAccepted() throws Exception {
		assertThat(search(s.substring(0, 1)).getResponse().getStatus()).isEqualTo(200);
	}

	@Test
	@DisplayName("50 文字は 200、51 文字は 422 で『50 文字以内で入力してください』")
	void lengthLimitIs50CodePoints() throws Exception {
		String fifty = s + "x".repeat(42);
		assertThat(fifty.codePointCount(0, fifty.length())).isEqualTo(50);

		assertThat(search(fifty).getResponse().getStatus()).isEqualTo(200);
		assertValidationError(search(fifty + "x"), TOO_LONG);
	}

	@Test
	@DisplayName("前後の空白（全角を含む）は取り除かれる")
	void surroundingWhitespaceIsStripped() throws Exception {
		Person alice = createUser("alice_" + s, "アリス");

		assertThat(ids(search(" alice_" + s + " "))).containsExactly(alice.id().toString());
		assertThat(ids(search("　alice_" + s + "　"))).containsExactly(alice.id().toString());
	}

	@Test
	@DisplayName("% を含む語で、% を含まない人は返らない")
	void percentIsLiteral() throws Exception {
		Person withPercent = createUser("pc_" + s, "達成" + s + "%率");
		createUser("pd_" + s, "達成" + s + "点");

		assertThat(ids(search(s + "%"))).containsExactly(withPercent.id().toString());
	}

	@Test
	@DisplayName("_ を含む語で、任意の 1 文字に一致しない")
	void underscoreIsLiteral() throws Exception {
		Person withUnderscore = createUser("a_c" + s, "表示名");
		createUser("abc" + s, "表示名");

		assertThat(ids(search("a_c" + s))).containsExactly(withUnderscore.id().toString());
	}

	@Test
	@DisplayName("\\ を含む語と末尾が \\ の語で 500 にならず、\\ を文字として探す")
	void backslashIsLiteral() throws Exception {
		Person withBackslash = createUser("bs_" + s, "a\\b" + s);

		assertThat(ids(search("a\\b" + s))).containsExactly(withBackslash.id().toString());
		assertThat(ids(search(s + "\\"))).isEmpty();
	}

	@Test
	@DisplayName("NUL（%00）を含む q は 422 で『使えない文字が含まれています』")
	void nulIsRejected() throws Exception {
		assertValidationError(send(get(URI.create("/api/users?q=a%00b" + s))), UNUSABLE);
	}

	@Test
	@DisplayName("ユーザー名と表示名の両方に一致しても、その人は 1 回だけ返る")
	void matchingBothColumnsReturnsOnce() throws Exception {
		Person dup = createUser("dup" + s, "dup" + s);

		assertThat(ids(search("dup" + s))).containsExactly(dup.id().toString());
	}

	@Test
	@DisplayName("21 人なら items が 20 で nextCursor が 20 件目の id。cursor で続きの 1 人が重複なく返り、nextCursor は null")
	void pagesThrough() throws Exception {
		List<String> created = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			created.add(createUser("pg" + s + "_" + i, "表示名").id().toString());
		}
		String q = "pg" + s;

		MvcResult first = search(q);

		List<String> firstIds = ids(first);
		assertThat(firstIds).containsExactlyElementsOf(created.reversed().subList(0, 20));
		String nextCursor = JsonPath.read(json(first), "$.nextCursor");
		assertThat(nextCursor).isEqualTo(firstIds.get(19));
		MvcResult second = search(q, nextCursor);
		List<String> secondIds = ids(second);
		assertThat(secondIds).containsExactly(created.get(0));
		assertThat(JsonPath.<Object>read(json(second), "$.nextCursor")).isNull();
		assertThat(firstIds).doesNotContainAnyElementsOf(secondIds);
	}

	@Test
	@DisplayName("並びは id の降順")
	void ordersByIdDescending() throws Exception {
		for (int i = 0; i < 5; i++) {
			createUser("od" + s + "_" + i, "表示名");
		}
		List<String> expected = jdbc.queryForList(
				"SELECT id::text FROM users WHERE username LIKE ? ORDER BY id DESC", String.class, "od" + s + "%");

		assertThat(ids(search("od" + s))).containsExactlyElementsOf(expected).hasSize(5);
	}

	@Test
	@DisplayName("未ログインは 401 UNAUTHENTICATED")
	void unauthenticatedIs401() throws Exception {
		MvcResult result = mockMvc.perform(get("/api/users").param("q", s)).andReturn();

		assertThat(result.getResponse().getStatus()).isEqualTo(401);
		assertThat((String) JsonPath.read(json(result), "$.code")).isEqualTo("UNAUTHENTICATED");
	}

	@Test
	@DisplayName("応答に email と password_hash が含まれない")
	void responseHasNoEmail() throws Exception {
		MvcResult result = search(s);

		assertThat(ids(result)).containsExactly(me.id().toString());
		String body = json(result);
		assertThat(body).doesNotContain("email").doesNotContain("password").doesNotContain("@example.com");
		assertThat(JsonPath.<List<Object>>read(body, "$.items[0].*")).hasSize(6);
	}

}
