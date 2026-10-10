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

import com.tkmedia.raisetimeline.domain.CommentCount;
import com.tkmedia.raisetimeline.domain.CommentWithAuthor;
import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.User;

/**
 * comments テーブルと CommentMapper を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>本物の DB が要るので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CommentMapperTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 11, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private PostMapper postMapper;

	@Autowired
	private CommentMapper commentMapper;

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

	private int commentRows(UUID postId) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM comments WHERE post_id = ?", Integer.class, postId);
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("insert は id を返し、findById は本文・作成日時・書いた人の username・displayName・avatarKey を返す")
	void insertThenFindById() {
		UUID author = createUser();
		UUID post = createPost(createUser());

		UUID id = commentMapper.insert(post, author, "はじめてのコメント", NOW);

		assertThat(id).isNotNull();
		CommentWithAuthor row = commentMapper.findById(id).orElseThrow();
		User user = userMapper.findById(author).orElseThrow();
		assertThat(row.id()).isEqualTo(id);
		assertThat(row.postId()).isEqualTo(post);
		assertThat(row.userId()).isEqualTo(author);
		assertThat(row.body()).isEqualTo("はじめてのコメント");
		assertThat(row.createdAt().toInstant()).isEqualTo(NOW.toInstant());
		assertThat(row.username()).isEqualTo(user.username());
		assertThat(row.displayName()).isEqualTo(user.displayName());
		assertThat(row.avatarKey()).isEqualTo(user.avatarKey());
	}

	@Test
	@DisplayName("findById は無い id で空を返す")
	void findByIdReturnsEmptyForMissingId() {
		assertThat(commentMapper.findById(UUID.randomUUID())).isEmpty();
	}

	@Test
	@DisplayName("findByPost はその投稿のコメントだけを id の降順で、cursor より古い行だけを limit 件返す")
	void findByPostPagesByIdDescending() {
		UUID user = createUser();
		UUID postA = createPost(user);
		UUID postB = createPost(user);
		UUID a1 = commentMapper.insert(postA, user, "A-1", NOW);
		UUID a2 = commentMapper.insert(postA, user, "A-2", NOW);
		UUID a3 = commentMapper.insert(postA, user, "A-3", NOW);
		// 別の投稿へのコメント（post_id の絞り込みが無いと、新しい順で先頭に混ざる）
		commentMapper.insert(postB, user, "B-1", NOW);

		List<CommentWithAuthor> firstPage = commentMapper.findByPost(postA, null, 2);

		assertThat(firstPage).extracting(CommentWithAuthor::id).containsExactly(a3, a2);
		List<CommentWithAuthor> secondPage = commentMapper.findByPost(postA, firstPage.get(1).id(), 2);
		assertThat(secondPage).extracting(CommentWithAuthor::id).containsExactly(a1);
	}

	@Test
	@DisplayName("countByPosts は投稿ごとの数を返し、コメントの無い投稿は結果に出ない")
	void countByPostsOmitsPostsWithoutComments() {
		UUID user = createUser();
		UUID a = createPost(user);
		UUID b = createPost(user);
		UUID c = createPost(user);
		commentMapper.insert(a, user, "1", NOW);
		commentMapper.insert(a, user, "2", NOW);
		commentMapper.insert(b, user, "3", NOW);

		List<CommentCount> counts = commentMapper.countByPosts(List.of(a, b, c));

		assertThat(counts).containsExactlyInAnyOrder(new CommentCount(a, 2), new CommentCount(b, 1));
	}

	@Test
	@DisplayName("delete は 1 を返し、無い id では 0 を返す")
	void deleteReturnsRemovedRows() {
		UUID user = createUser();
		UUID post = createPost(user);
		UUID id = commentMapper.insert(post, user, "消す", NOW);

		assertThat(commentMapper.delete(id)).isEqualTo(1);
		assertThat(commentMapper.delete(id)).isZero();
		assertThat(commentMapper.findById(id)).isEmpty();
	}

	@Test
	@DisplayName("絵文字を含む 280 文字の本文を保存できる")
	void storesEmojiBodyOf280CodePoints() {
		UUID user = createUser();
		UUID post = createPost(user);
		String body = "😀".repeat(280);

		UUID id = commentMapper.insert(post, user, body, NOW);

		assertThat(commentMapper.findById(id).orElseThrow().body()).isEqualTo(body);
	}

	@Test
	@DisplayName("空の本文は検査の制約に違反する")
	void emptyBodyViolatesCheckConstraint() {
		UUID user = createUser();
		UUID post = createPost(user);

		assertThatThrownBy(() -> commentMapper.insert(post, user, "", NOW))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	@DisplayName("存在しない投稿に入れると外部キー違反になり、制約名は comments_post_id_fkey")
	void insertForMissingPostViolatesForeignKey() {
		UUID user = createUser();

		assertThatThrownBy(() -> commentMapper.insert(UUID.randomUUID(), user, "本文", NOW))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(((DataIntegrityViolationException) e).getMostSpecificCause().getMessage())
						.contains("comments_post_id_fkey"));
	}

	@Test
	@DisplayName("存在しない利用者で入れると外部キー違反になり、制約名は comments_user_id_fkey")
	void insertForMissingUserViolatesForeignKey() {
		UUID post = createPost(createUser());

		assertThatThrownBy(() -> commentMapper.insert(post, UUID.randomUUID(), "本文", NOW))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(((DataIntegrityViolationException) e).getMostSpecificCause().getMessage())
						.contains("comments_user_id_fkey"));
	}

	@Test
	@DisplayName("投稿を消すと、その投稿のコメントも消える")
	void deletingPostDeletesComments() {
		UUID user = createUser();
		UUID post = createPost(createUser());
		commentMapper.insert(post, user, "本文", NOW);
		assertThat(commentRows(post)).isEqualTo(1);

		postMapper.delete(post);

		assertThat(commentRows(post)).isZero();
	}

	@Test
	@DisplayName("利用者を消すと、その人のコメントも、その人の投稿へのコメントも消える")
	void deletingUserDeletesTheirCommentsAndCommentsOnTheirPosts() {
		UUID withdrawn = createUser();
		UUID other = createUser();
		UUID othersPost = createPost(other);
		UUID withdrawnPost = createPost(withdrawn);
		commentMapper.insert(othersPost, withdrawn, "退会する人のコメント", NOW);
		commentMapper.insert(withdrawnPost, other, "退会する人の投稿へのコメント", NOW);

		jdbc.update("DELETE FROM users WHERE id = ?", withdrawn);

		assertThat(commentRows(othersPost)).isZero();
		assertThat(commentRows(withdrawnPost)).isZero();
	}

}
