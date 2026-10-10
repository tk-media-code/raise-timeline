package com.tkmedia.raisetimeline.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

import com.tkmedia.raisetimeline.domain.LikeCount;
import com.tkmedia.raisetimeline.domain.Liker;
import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.User;

/**
 * likes テーブルと LikeMapper を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>本物の DB が要るので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class LikeMapperTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 10, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private PostMapper postMapper;

	@Autowired
	private LikeMapper likeMapper;

	@Autowired
	private JdbcTemplate jdbc;

	private UUID createUser() {
		String s = UUID.randomUUID().toString().substring(0, 8);
		String username = "user_" + s;
		return userMapper.insert(new User(null, username, "表示名" + s, username + "@example.com",
				"hash", "自己紹介" + s, null, NOW, NOW));
	}

	private UUID createPost(UUID userId) {
		return postMapper.insert(new Post(null, userId, "本文", NOW, NOW));
	}

	private int likeRows(UUID postId) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM likes WHERE post_id = ?", Integer.class, postId);
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("insert は 1 を返し、同じ人が同じ投稿に 2 回入れると 0 を返して行は 1 つのまま")
	void insertIsIdempotent() {
		UUID user = createUser();
		UUID post = createPost(createUser());

		assertThat(likeMapper.insert(post, user)).isEqualTo(1);
		assertThat(likeMapper.insert(post, user)).isZero();

		assertThat(likeRows(post)).isEqualTo(1);
	}

	@Test
	@DisplayName("delete は 1 を返し、無い行では 0 を返す")
	void deleteReturnsRemovedRows() {
		UUID user = createUser();
		UUID post = createPost(createUser());
		likeMapper.insert(post, user);

		assertThat(likeMapper.delete(post, user)).isEqualTo(1);
		assertThat(likeMapper.delete(post, user)).isZero();
		assertThat(likeRows(post)).isZero();
	}

	@Test
	@DisplayName("countByPosts は投稿ごとの数を返し、いいねの無い投稿は結果に出ない")
	void countByPostsOmitsPostsWithoutLikes() {
		UUID author = createUser();
		UUID a = createPost(author);
		UUID b = createPost(author);
		UUID c = createPost(author);
		UUID u1 = createUser();
		UUID u2 = createUser();
		likeMapper.insert(a, u1);
		likeMapper.insert(a, u2);
		likeMapper.insert(b, u1);

		List<LikeCount> counts = likeMapper.countByPosts(List.of(a, b, c));

		assertThat(counts).containsExactlyInAnyOrder(new LikeCount(a, 2), new LikeCount(b, 1));
	}

	@Test
	@DisplayName("findLikedPostIds は、渡した投稿のうち自分が付けたものだけを返す")
	void findLikedPostIdsReturnsOnlyMine() {
		UUID author = createUser();
		UUID me = createUser();
		UUID other = createUser();
		UUID a = createPost(author);
		UUID b = createPost(author);
		UUID c = createPost(author);
		likeMapper.insert(a, me);
		likeMapper.insert(b, other);

		assertThat(likeMapper.findLikedPostIds(me, List.of(a, b, c))).containsExactly(a);
	}

	@Test
	@DisplayName("findLikers は likes.id の降順で、cursor より古い行だけを limit 件返し、利用者の値が付く")
	void findLikersPagesByLikeIdDescending() {
		UUID post = createPost(createUser());
		UUID u1 = createUser();
		UUID u2 = createUser();
		UUID u3 = createUser();
		likeMapper.insert(post, u1);
		likeMapper.insert(post, u2);
		likeMapper.insert(post, u3);

		List<Liker> firstPage = likeMapper.findLikers(post, null, 2);

		assertThat(firstPage).extracting(Liker::userId).containsExactly(u3, u2);
		List<Liker> secondPage = likeMapper.findLikers(post, firstPage.get(1).likeId(), 2);
		assertThat(secondPage).extracting(Liker::userId).containsExactly(u1);

		Liker row = secondPage.get(0);
		User user = userMapper.findById(u1).orElseThrow();
		assertThat(row.likeId()).isNotNull();
		assertThat(row.username()).isEqualTo(user.username());
		assertThat(row.displayName()).isEqualTo(user.displayName());
		assertThat(row.avatarKey()).isEqualTo(user.avatarKey());
		assertThat(row.bio()).isEqualTo(user.bio());
	}

	@Test
	@DisplayName("存在しない投稿に入れると外部キー違反になり、制約名は likes_post_id_fkey")
	void insertForMissingPostViolatesForeignKey() {
		UUID user = createUser();

		assertThatThrownBy(() -> likeMapper.insert(UUID.randomUUID(), user))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(((DataIntegrityViolationException) e).getMostSpecificCause().getMessage())
						.contains("likes_post_id_fkey"));
	}

	@Test
	@DisplayName("存在しない利用者で入れると外部キー違反になり、制約名は likes_user_id_fkey")
	void insertForMissingUserViolatesForeignKey() {
		UUID post = createPost(createUser());

		assertThatThrownBy(() -> likeMapper.insert(post, UUID.randomUUID()))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(((DataIntegrityViolationException) e).getMostSpecificCause().getMessage())
						.contains("likes_user_id_fkey"));
	}

	@Test
	@DisplayName("投稿を消すと、その投稿のいいねも消える")
	void deletingPostDeletesLikes() {
		UUID post = createPost(createUser());
		likeMapper.insert(post, createUser());
		assertThat(likeRows(post)).isEqualTo(1);

		postMapper.delete(post);

		assertThat(likeRows(post)).isZero();
	}

	@Test
	@DisplayName("利用者を消すと、その人のいいねも、その人の投稿へのいいねも消える")
	void deletingUserDeletesTheirLikesAndLikesOnTheirPosts() {
		UUID withdrawn = createUser();
		UUID other = createUser();
		UUID othersPost = createPost(other);
		UUID withdrawnPost = createPost(withdrawn);
		likeMapper.insert(othersPost, withdrawn);
		likeMapper.insert(withdrawnPost, other);

		jdbc.update("DELETE FROM users WHERE id = ?", withdrawn);

		assertThat(likeRows(othersPost)).isZero();
		assertThat(likeRows(withdrawnPost)).isZero();
	}

}
