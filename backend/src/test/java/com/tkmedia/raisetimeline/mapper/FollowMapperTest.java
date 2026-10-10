package com.tkmedia.raisetimeline.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.tkmedia.raisetimeline.domain.FollowStats;
import com.tkmedia.raisetimeline.domain.User;
import com.tkmedia.raisetimeline.domain.UserCardRow;

/**
 * follows テーブルと FollowMapper を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>本物の DB が要るので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FollowMapperTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 11, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private FollowMapper followMapper;

	@Autowired
	private JdbcTemplate jdbc;

	private UUID createUser() {
		return createUser(null);
	}

	private UUID createUser(String avatarKey) {
		String s = UUID.randomUUID().toString().substring(0, 8);
		String username = "user_" + s;
		return userMapper.insert(new User(null, username, "表示名" + s, username + "@example.com",
				"hash", "自己紹介" + s, avatarKey, NOW, NOW));
	}

	private int followRows() {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM follows", Integer.class);
		return count == null ? 0 : count;
	}

	private int followRowsOf(UUID user) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM follows WHERE follower_id = ? OR followee_id = ?",
				Integer.class, user, user);
		return count == null ? 0 : count;
	}

	private static String constraintOf(Throwable e) {
		return ((DataIntegrityViolationException) e).getMostSpecificCause().getMessage();
	}

	@Test
	@DisplayName("insert は 1 を返し、同じ組をもう一度入れると 0 を返して行は 1 つのまま")
	void insertIsIdempotent() {
		UUID a = createUser();
		UUID b = createUser();

		assertThat(followMapper.insert(a, b)).isEqualTo(1);
		assertThat(followMapper.insert(a, b)).isZero();

		assertThat(followRowsOf(a)).isEqualTo(1);
	}

	@Test
	@DisplayName("向きがある: A が B をフォローしても、B が A をフォローしたことにはならない")
	void followIsDirected() {
		UUID a = createUser();
		UUID b = createUser();

		followMapper.insert(a, b);

		assertThat(followMapper.findFollowing(b, a, null, 10)).isEmpty();
		assertThat(followMapper.findFollowers(a, b, null, 10)).isEmpty();
		assertThat(followMapper.findFollowing(a, b, null, 10)).extracting(UserCardRow::userId).containsExactly(b);
	}

	@Test
	@DisplayName("delete は 1 を返し、無い組では 0 を返す")
	void deleteReturnsRemovedRows() {
		UUID a = createUser();
		UUID b = createUser();
		followMapper.insert(a, b);

		assertThat(followMapper.delete(a, b)).isEqualTo(1);
		assertThat(followMapper.delete(a, b)).isZero();
		assertThat(followRows()).isZero();
	}

	@Test
	@DisplayName("自分自身を入れると検査の制約に違反する")
	void insertSelfViolatesCheck() {
		UUID a = createUser();

		assertThatThrownBy(() -> followMapper.insert(a, a))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(constraintOf(e)).contains("check constraint"));
	}

	@Test
	@DisplayName("存在しない相手を入れると外部キー違反になり、制約名は follows_followee_id_fkey")
	void insertForMissingFolloweeViolatesForeignKey() {
		UUID a = createUser();

		assertThatThrownBy(() -> followMapper.insert(a, UUID.randomUUID()))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(constraintOf(e)).contains("follows_followee_id_fkey"));
	}

	@Test
	@DisplayName("存在しない自分で入れると外部キー違反になり、制約名は follows_follower_id_fkey")
	void insertForMissingFollowerViolatesForeignKey() {
		UUID b = createUser();

		assertThatThrownBy(() -> followMapper.insert(UUID.randomUUID(), b))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(constraintOf(e)).contains("follows_follower_id_fkey"));
	}

	@Test
	@DisplayName("findFollowers はその人のフォロワーだけを follows.id の降順で、cursor より古い行だけを limit 件返す。cursorId は follows.id")
	void findFollowersPagesByFollowIdDescending() {
		UUID b = createUser();
		UUID a = createUser();
		UUID c = createUser();
		UUID d = createUser();
		UUID e = createUser();
		UUID f = createUser();
		UUID viewer = createUser();
		followMapper.insert(a, b);
		followMapper.insert(c, b);
		followMapper.insert(d, b);
		// 別の人へのフォロー（followee_id の絞り込みが無いと、新しい順で先頭に混ざる）
		followMapper.insert(e, f);

		List<UserCardRow> firstPage = followMapper.findFollowers(b, viewer, null, 2);

		assertThat(firstPage).extracting(UserCardRow::userId).containsExactly(d, c);
		String followId = jdbc.queryForObject("SELECT id::text FROM follows WHERE follower_id = ? AND followee_id = ?",
				String.class, c, b);
		assertThat(firstPage.get(1).cursorId()).hasToString(followId);
		List<UserCardRow> secondPage = followMapper.findFollowers(b, viewer, firstPage.get(1).cursorId(), 2);
		assertThat(secondPage).extracting(UserCardRow::userId).containsExactly(a);
	}

	@Test
	@DisplayName("findFollowing はその人がフォローしている人を、同じ規則（follows.id の降順・cursor）で返す")
	void findFollowingPagesByFollowIdDescending() {
		UUID a = createUser();
		UUID b = createUser();
		UUID c = createUser();
		UUID d = createUser();
		UUID e = createUser();
		UUID viewer = createUser();
		followMapper.insert(a, b);
		followMapper.insert(a, c);
		followMapper.insert(a, d);
		// 別の人のフォロー中（follower_id の絞り込みが無いと、新しい順で先頭に混ざる）
		followMapper.insert(e, a);

		List<UserCardRow> firstPage = followMapper.findFollowing(a, viewer, null, 2);

		assertThat(firstPage).extracting(UserCardRow::userId).containsExactly(d, c);
		String followId = jdbc.queryForObject("SELECT id::text FROM follows WHERE follower_id = ? AND followee_id = ?",
				String.class, a, c);
		assertThat(firstPage.get(1).cursorId()).hasToString(followId);
		List<UserCardRow> secondPage = followMapper.findFollowing(a, viewer, firstPage.get(1).cursorId(), 2);
		assertThat(secondPage).extracting(UserCardRow::userId).containsExactly(b);
	}

	@Test
	@DisplayName("isFollowing は viewer がその行の人をフォローしているときだけ true")
	void isFollowingIsFromViewerPointOfView() {
		UUID b = createUser();
		UUID a = createUser();
		UUID c = createUser();
		UUID d = createUser();
		UUID viewer = createUser();
		followMapper.insert(a, b);
		followMapper.insert(c, b);
		followMapper.insert(d, b);
		// viewer が C だけをフォローしている。A は viewer をフォローしている（向きが逆なので数えない）
		followMapper.insert(viewer, c);
		followMapper.insert(a, viewer);

		List<UserCardRow> rows = followMapper.findFollowers(b, viewer, null, 10);

		assertThat(rows).extracting(UserCardRow::userId, UserCardRow::isFollowing)
				.containsExactly(tuple(d, false), tuple(c, true),
						tuple(a, false));
	}

	@Test
	@DisplayName("行に bio と avatarKey が入る")
	void rowCarriesBioAndAvatarKey() {
		UUID b = createUser();
		UUID a = createUser("avatars/a.png");
		UUID viewer = createUser();
		followMapper.insert(a, b);

		UserCardRow row = followMapper.findFollowers(b, viewer, null, 10).get(0);

		User user = userMapper.findById(a).orElseThrow();
		assertThat(row.userId()).isEqualTo(a);
		assertThat(row.username()).isEqualTo(user.username());
		assertThat(row.displayName()).isEqualTo(user.displayName());
		assertThat(row.avatarKey()).isEqualTo("avatars/a.png");
		assertThat(row.bio()).isEqualTo(user.bio());
	}

	@Test
	@DisplayName("stats はフォロワー数・フォロー中の数・viewer がフォローしているかを返す")
	void statsCountsBothDirections() {
		UUID target = createUser();
		UUID f1 = createUser();
		UUID f2 = createUser();
		UUID g1 = createUser();
		UUID viewer = createUser();
		followMapper.insert(f1, target);
		followMapper.insert(f2, target);
		followMapper.insert(viewer, target);
		followMapper.insert(target, g1);

		assertThat(followMapper.stats(target, viewer)).isEqualTo(new FollowStats(3, 1, true));
		assertThat(followMapper.stats(target, f1)).isEqualTo(new FollowStats(3, 1, true));
		assertThat(followMapper.stats(target, g1)).isEqualTo(new FollowStats(3, 1, false));
	}

	@Test
	@DisplayName("stats は自分を見ると isFollowing が false で、無い id は 0・0・false の 1 行")
	void statsForSelfAndMissingUser() {
		UUID target = createUser();
		UUID other = createUser();
		followMapper.insert(other, target);

		assertThat(followMapper.stats(target, target)).isEqualTo(new FollowStats(1, 0, false));
		assertThat(followMapper.stats(UUID.randomUUID(), target)).isEqualTo(new FollowStats(0, 0, false));
	}

	@Test
	@DisplayName("利用者を消すと、その人がフォローしている行も、フォローされている行も消える")
	void deletingUserDeletesBothDirections() {
		UUID withdrawn = createUser();
		UUID other = createUser();
		UUID third = createUser();
		followMapper.insert(withdrawn, other);
		followMapper.insert(third, withdrawn);
		followMapper.insert(third, other);

		jdbc.update("DELETE FROM users WHERE id = ?", withdrawn);

		assertThat(followRowsOf(withdrawn)).isZero();
		assertThat(followRows()).isEqualTo(1);
	}

}
