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
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.PostImage;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.domain.User;

/**
 * posts・post_images テーブルと PostMapper を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>本物の DB が要るので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PostMapperTest {

	private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 9, 12, 0, 0, 0, ZoneOffset.UTC);

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private PostMapper postMapper;

	@Autowired
	private JdbcTemplate jdbc;

	private String lastUsername;

	private UUID createUser() {
		String s = UUID.randomUUID().toString().substring(0, 8);
		lastUsername = "user_" + s;
		return userMapper.insert(new User(null, lastUsername, "表示名" + s, lastUsername + "@example.com",
				"hash", "", null, NOW, NOW));
	}

	private UUID createPost(UUID userId, String body) {
		return postMapper.insert(new Post(null, userId, body, NOW, NOW));
	}

	private int imageCount(UUID postId) {
		Integer count = jdbc.queryForObject("SELECT count(*) FROM post_images WHERE post_id = ?",
				Integer.class, postId);
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("入れた行が採番された id で引け、投稿者の名前が付く")
	void insertAndFindById() {
		UUID userId = createUser();
		OffsetDateTime created = NOW.plusMinutes(1);
		OffsetDateTime updated = NOW.plusMinutes(2);

		UUID id = postMapper.insert(new Post(null, userId, "こんにちは", created, updated));

		assertThat(id).isNotNull();
		PostWithAuthor found = postMapper.findById(id).orElseThrow();
		assertThat(found.id()).isEqualTo(id);
		assertThat(found.userId()).isEqualTo(userId);
		assertThat(found.body()).isEqualTo("こんにちは");
		assertThat(found.createdAt().toInstant()).isEqualTo(created.toInstant());
		assertThat(found.updatedAt().toInstant()).isEqualTo(updated.toInstant());
		assertThat(found.username()).isEqualTo(lastUsername);
		assertThat(found.displayName()).isEqualTo(userMapper.findById(userId).orElseThrow().displayName());
		assertThat(found.avatarKey()).isNull();
	}

	@Test
	@DisplayName("存在しない id では空が返る")
	void findByIdReturnsEmptyWhenMissing() {
		assertThat(postMapper.findById(UUID.randomUUID())).isEmpty();
	}

	@Test
	@DisplayName("本文の改行と絵文字がそのまま戻る")
	void bodyKeepsLineFeedsAndEmoji() {
		UUID id = createPost(createUser(), "一行目\n二行目😀");

		assertThat(postMapper.findById(id).orElseThrow().body()).isEqualTo("一行目\n二行目😀");
	}

	@Test
	@DisplayName("本文は 280 コードポイントまで入り、281 は DB が拒む")
	void bodyOf280CodePointsFits() {
		UUID userId = createUser();

		UUID id = createPost(userId, "😀".repeat(280));

		assertThat(postMapper.findById(id).orElseThrow().body().codePointCount(0, 560)).isEqualTo(280);
		assertThatThrownBy(() -> createPost(userId, "😀".repeat(281)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	@DisplayName("本文と更新日時を変えて 1 を返し、無い id では 0 を返す")
	void updateBodyChangesBodyAndUpdatedAt() {
		UUID id = createPost(createUser(), "前");
		OffsetDateTime later = NOW.plusHours(1);

		int updated = postMapper.updateBody(id, "後", later);

		assertThat(updated).isEqualTo(1);
		PostWithAuthor found = postMapper.findById(id).orElseThrow();
		assertThat(found.body()).isEqualTo("後");
		assertThat(found.updatedAt().toInstant()).isEqualTo(later.toInstant());
		assertThat(found.createdAt().toInstant()).isEqualTo(NOW.toInstant());
		assertThat(postMapper.updateBody(UUID.randomUUID(), "後", later)).isZero();
	}

	@Test
	@DisplayName("投稿を消すと、その投稿の画像の行も消える")
	void deleteRemovesPostAndImages() {
		UUID id = createPost(createUser(), "消す");
		jdbc.update("INSERT INTO post_images (post_id, object_key, position) VALUES (?, 'posts/x.jpg', 0)", id);
		assertThat(imageCount(id)).isEqualTo(1);

		assertThat(postMapper.delete(id)).isEqualTo(1);

		assertThat(postMapper.findById(id)).isEmpty();
		assertThat(imageCount(id)).isZero();
		assertThat(postMapper.delete(id)).isZero();
	}

	@Test
	@DisplayName("insertImages で 3 件入れると、findImages が position 0 から 2 の順で返る")
	void insertImagesKeepsOrder() {
		UUID id = createPost(createUser(), "画像");

		postMapper.insertImages(id, List.of("posts/a.jpg", "posts/b.png", "posts/c.webp"));

		List<PostImage> images = postMapper.findImages(List.of(id));
		assertThat(images).extracting(PostImage::objectKey).containsExactly("posts/a.jpg", "posts/b.png", "posts/c.webp");
		assertThat(images).extracting(PostImage::position).containsExactly(0, 1, 2);
		assertThat(images).extracting(PostImage::postId).containsOnly(id);
		assertThat(images).extracting(PostImage::id).doesNotContainNull();
	}

	@Test
	@DisplayName("2 つの投稿の画像は、投稿ごとに position の順で返る")
	void findImagesForSeveralPosts() {
		UUID userId = createUser();
		UUID first = createPost(userId, "1");
		UUID second = createPost(userId, "2");
		postMapper.insertImages(second, List.of("posts/s0.jpg", "posts/s1.jpg"));
		postMapper.insertImages(first, List.of("posts/f0.jpg", "posts/f1.jpg", "posts/f2.jpg"));

		List<PostImage> images = postMapper.findImages(List.of(first, second));

		assertThat(images).extracting(PostImage::objectKey)
				.containsExactly("posts/f0.jpg", "posts/f1.jpg", "posts/f2.jpg", "posts/s0.jpg", "posts/s1.jpg");
		assertThat(images).filteredOn(i -> i.postId().equals(second)).extracting(PostImage::position)
				.containsExactly(0, 1);
	}

	@Test
	@DisplayName("画像の無い投稿だけを渡すと、findImages は空を返す")
	void findImagesOfPostWithoutImages() {
		UUID id = createPost(createUser(), "画像なし");

		assertThat(postMapper.findImages(List.of(id))).isEmpty();
	}

	@Test
	@DisplayName("findImageKeys は position の順にキーだけを返し、画像の無い投稿では空")
	void findImageKeysInOrder() {
		UUID userId = createUser();
		UUID id = createPost(userId, "画像");
		UUID none = createPost(userId, "なし");
		postMapper.insertImages(id, List.of("posts/a.jpg", "posts/b.jpg"));

		assertThat(postMapper.findImageKeys(id)).containsExactly("posts/a.jpg", "posts/b.jpg");
		assertThat(postMapper.findImageKeys(none)).isEmpty();
	}

	@Test
	@DisplayName("投稿を消すと insertImages で入れた画像の行も消える")
	void deleteRemovesInsertedImages() {
		UUID id = createPost(createUser(), "消す");
		postMapper.insertImages(id, List.of("posts/a.jpg", "posts/b.jpg"));

		postMapper.delete(id);

		assertThat(imageCount(id)).isZero();
		assertThat(postMapper.findImages(List.of(id))).isEmpty();
	}

	@Test
	@DisplayName("利用者を消すと、その投稿も消える")
	void deletingUserDeletesPosts() {
		UUID userId = createUser();
		UUID id = createPost(userId, "残らない");

		jdbc.update("DELETE FROM users WHERE id = ?", userId);

		assertThat(postMapper.findById(id)).isEmpty();
	}

	@Test
	@DisplayName("存在しない利用者の投稿は外部キー違反になり、制約名で見分けられる")
	void insertForMissingUserViolatesForeignKey() {
		assertThatThrownBy(() -> createPost(UUID.randomUUID(), "誰の投稿でもない"))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(((DataIntegrityViolationException) e).getMostSpecificCause().getMessage())
						.contains("posts_user_id_fkey"));
	}

	@Test
	@DisplayName("画像の位置は 0 から 3 までで、同じ投稿で重ねて使えない")
	void imagePositionIsChecked() {
		UUID id = createPost(createUser(), "画像");
		String insertImage = "INSERT INTO post_images (post_id, object_key, position) VALUES (?, 'posts/y.jpg', ?)";

		jdbc.update(insertImage, id, 0);
		// 制約違反でトランザクションが中止にならないよう、検査ごとにセーブポイントへ戻す。
		jdbc.execute("SAVEPOINT before_check");
		assertThatThrownBy(() -> jdbc.update(insertImage, id, 4))
				.isInstanceOf(DataIntegrityViolationException.class);
		jdbc.execute("ROLLBACK TO SAVEPOINT before_check");
		assertThatThrownBy(() -> jdbc.update(insertImage, id, 0))
				.isInstanceOf(DuplicateKeyException.class);
	}

	@Test
	@DisplayName("カーソルが無いときは、新しい順に指定の件数だけ返る")
	void findAllReturnsNewestFirst() {
		jdbc.update("DELETE FROM posts");
		UUID userId = createUser();
		createPost(userId, "1");
		UUID second = createPost(userId, "2");
		UUID third = createPost(userId, "3");

		List<PostWithAuthor> posts = postMapper.findAll(null, 2);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(third, second);
	}

	@Test
	@DisplayName("カーソルを渡すと、それより古い行だけが返る")
	void findAllWithCursorReturnsOnlyOlder() {
		jdbc.update("DELETE FROM posts");
		UUID userId = createUser();
		UUID first = createPost(userId, "1");
		UUID second = createPost(userId, "2");
		createPost(userId, "3");

		List<PostWithAuthor> posts = postMapper.findAll(second, 10);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(first);
	}

	@Test
	@DisplayName("カーソルの行が消えていても、より古い行が欠けずに返る")
	void findAllWithDeletedCursor() {
		jdbc.update("DELETE FROM posts");
		UUID userId = createUser();
		UUID first = createPost(userId, "1");
		UUID second = createPost(userId, "2");
		createPost(userId, "3");
		postMapper.delete(second);

		List<PostWithAuthor> posts = postMapper.findAll(second, 10);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(first);
	}

	@Test
	@DisplayName("投稿が 1 件も無ければ空のリストが返る")
	void findAllOnEmptyTable() {
		jdbc.update("DELETE FROM posts");

		assertThat(postMapper.findAll(null, 10)).isEmpty();
	}

	@Test
	@DisplayName("利用者を指定すると、その人の投稿だけが新しい順に返る")
	void findByUserReturnsOnlyThatUsersPostsNewestFirst() {
		UUID alice = createUser();
		UUID bob = createUser();
		UUID a1 = createPost(alice, "a1");
		createPost(bob, "b1");
		UUID a2 = createPost(alice, "a2");
		createPost(bob, "b2");

		List<PostWithAuthor> posts = postMapper.findByUser(alice, null, 10);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(a2, a1);
		assertThat(posts).extracting(PostWithAuthor::userId).containsOnly(alice);
	}

	@Test
	@DisplayName("利用者の投稿にカーソルを渡すと、それより古いその人の投稿だけが返る")
	void findByUserWithCursorReturnsOnlyOlder() {
		UUID alice = createUser();
		UUID bob = createUser();
		UUID a1 = createPost(alice, "a1");
		createPost(bob, "b1");
		UUID a2 = createPost(alice, "a2");
		createPost(alice, "a3");

		List<PostWithAuthor> posts = postMapper.findByUser(alice, a2, 10);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(a1);
	}

	@Test
	@DisplayName("利用者の投稿でも、カーソルの行が消えていてより古い行が欠けずに返る")
	void findByUserWithDeletedCursor() {
		UUID alice = createUser();
		UUID a1 = createPost(alice, "a1");
		UUID a2 = createPost(alice, "a2");
		createPost(alice, "a3");
		postMapper.delete(a2);

		List<PostWithAuthor> posts = postMapper.findByUser(alice, a2, 10);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(a1);
	}

	@Test
	@DisplayName("利用者の投稿は、指定の件数で打ち切られる")
	void findByUserHonorsLimit() {
		UUID alice = createUser();
		createPost(alice, "a1");
		UUID a2 = createPost(alice, "a2");
		UUID a3 = createPost(alice, "a3");

		List<PostWithAuthor> posts = postMapper.findByUser(alice, null, 2);

		assertThat(posts).extracting(PostWithAuthor::id).containsExactly(a3, a2);
	}

	@Test
	@DisplayName("投稿の無い利用者では空のリストが返る")
	void findByUserOfUserWithoutPosts() {
		UUID alice = createUser();
		UUID bob = createUser();
		createPost(bob, "b1");

		assertThat(postMapper.findByUser(alice, null, 10)).isEmpty();
	}

}
