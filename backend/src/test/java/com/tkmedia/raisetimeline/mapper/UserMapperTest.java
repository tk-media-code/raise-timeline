package com.tkmedia.raisetimeline.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.tkmedia.raisetimeline.domain.ReplacedAvatar;
import com.tkmedia.raisetimeline.domain.User;

/**
 * users テーブルと UserMapper を、テスト専用の本物の PostgreSQL で確かめる。
 *
 * <p>本物の DB が要るので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UserMapperTest {

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private JdbcTemplate jdbc;

	/** 利用者名の長さの上限（20 文字）に収まるよう、UUID の一部を 8 文字だけ使う。 */
	private static String suffix() {
		return UUID.randomUUID().toString().substring(0, 8);
	}

	private static User newUser(String username, String email) {
		OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
		return new User(null, username, "表示名", email, "hash", "", null, now, now);
	}

	@Test
	@DisplayName("入れた行が id で引け、採番された id と登録日時が入っている")
	void insertAndFindById() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));

		assertThat(id).isNotNull();
		User found = userMapper.findById(id).orElseThrow();
		assertThat(found.id()).isEqualTo(id);
		assertThat(found.username()).isEqualTo("user_" + s);
		assertThat(found.displayName()).isEqualTo("表示名");
		assertThat(found.email()).isEqualTo("user_" + s + "@example.com");
		assertThat(found.passwordHash()).isEqualTo("hash");
		assertThat(found.bio()).isEmpty();
		assertThat(found.avatarKey()).isNull();
		assertThat(found.createdAt()).isNotNull();
		assertThat(found.updatedAt()).isNotNull();
	}

	@Test
	@DisplayName("存在しない id では空が返る")
	void findByIdReturnsEmptyWhenMissing() {
		assertThat(userMapper.findById(UUID.randomUUID())).isEmpty();
	}

	@Test
	@DisplayName("existsById は登録済みの id で true、知らない id で false")
	void existsByIdReflectsRow() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));

		assertThat(userMapper.existsById(id)).isTrue();
		assertThat(userMapper.existsById(UUID.randomUUID())).isFalse();
	}

	@Test
	@DisplayName("メールアドレスは大文字小文字を区別せずに引ける")
	void findByEmailIgnoresCase() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "Alice_" + s + "@Example.com"));

		assertThat(userMapper.findByEmail("alice_" + s + "@example.com"))
				.hasValueSatisfying(u -> assertThat(u.id()).isEqualTo(id));
		assertThat(userMapper.existsByEmail("ALICE_" + s + "@EXAMPLE.COM")).isTrue();
		assertThat(userMapper.existsByEmail("none_" + s + "@example.com")).isFalse();
	}

	@Test
	@DisplayName("利用者名は大文字小文字を区別せずに引ける")
	void findByUsernameIgnoresCase() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("Alice_" + s, "user_" + s + "@example.com"));

		assertThat(userMapper.findByUsername("alice_" + s))
				.hasValueSatisfying(u -> assertThat(u.id()).isEqualTo(id));
		assertThat(userMapper.existsByUsername("ALICE_" + s)).isTrue();
		assertThat(userMapper.existsByUsername("none_" + s)).isFalse();
	}

	@Test
	@DisplayName("大文字小文字だけが違う利用者名は重複として拒否され、制約名が文言に入る")
	void duplicateUsernameDiffersOnlyByCaseIsRejected() {
		String s = suffix();
		userMapper.insert(newUser("alice_" + s, "a_" + s + "@example.com"));

		assertThatThrownBy(() -> userMapper.insert(newUser("Alice_" + s, "b_" + s + "@example.com")))
				.isInstanceOf(DuplicateKeyException.class)
				.hasMessageContaining("users_username_lower_key");
	}

	@Test
	@DisplayName("同じメールアドレス（大文字小文字違いを含む）は重複として拒否され、制約名が文言に入る")
	void duplicateEmailIsRejected() {
		String s = suffix();
		userMapper.insert(newUser("a_" + s, "dup_" + s + "@example.com"));

		assertThatThrownBy(() -> userMapper.insert(newUser("b_" + s, "DUP_" + s + "@Example.com")))
				.isInstanceOf(DuplicateKeyException.class)
				.hasMessageContaining("users_email_lower_key");
	}

	// 1 つのトランザクションで失敗した SQL の後は何も実行できないので、1 件ずつテストを分ける。
	@ParameterizedTest
	@ValueSource(strings = { "ab", "a-b", "あいう" })
	@DisplayName("利用者名が 3〜20 文字の英数字と _ でないときは CHECK 制約で拒否される")
	void usernameCheckConstraint(String username) {
		String s = suffix();

		assertThatThrownBy(() -> userMapper.insert(newUser(username, "check_" + s + "@example.com")))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	@DisplayName("updateProfile は更新後の行を返し、表示名・自己紹介・更新日時だけを変える")
	void updateProfileReturnsUpdatedRow() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));
		User before = userMapper.findById(id).orElseThrow();
		OffsetDateTime later = OffsetDateTime.of(2026, 10, 10, 9, 0, 0, 0, ZoneOffset.UTC);

		User returned = userMapper.updateProfile(id, "新しい名前", "よろしく\n😀", later).orElseThrow();

		assertThat(returned.id()).isEqualTo(id);
		assertThat(returned.displayName()).isEqualTo("新しい名前");
		assertThat(returned.bio()).isEqualTo("よろしく\n😀");
		assertThat(returned.updatedAt().toInstant()).isEqualTo(later.toInstant());
		assertThat(returned.username()).isEqualTo(before.username());
		assertThat(returned.email()).isEqualTo(before.email());
		assertThat(returned.avatarKey()).isEqualTo(before.avatarKey());
		assertThat(returned.passwordHash()).isEqualTo(before.passwordHash());
		assertThat(returned.createdAt().toInstant()).isEqualTo(before.createdAt().toInstant());
		assertThat(userMapper.findById(id).orElseThrow()).isEqualTo(returned);
	}

	@Test
	@DisplayName("updateProfile は知らない id で空を返す")
	void updateProfileOfMissingUserReturnsEmpty() {
		assertThat(userMapper.updateProfile(UUID.randomUUID(), "名前", "", OffsetDateTime.now(ZoneOffset.UTC))).isEmpty();
	}

	@Test
	@DisplayName("自己紹介は 160 コードポイントまで入り、161 は DB が拒む")
	void bioOf160CodePointsFits() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));
		OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

		userMapper.updateProfile(id, "名前", "😀".repeat(160), now);

		assertThat(userMapper.findById(id).orElseThrow().bio().codePointCount(0, 320)).isEqualTo(160);
		assertThatThrownBy(() -> userMapper.updateProfile(id, "名前", "😀".repeat(161), now))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	@DisplayName("初めてのアイコン差し替えは古いキーが null で返り、2 回目は 1 回目のキーが返る")
	void replaceAvatarKeyReturnsOldKey() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));
		OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

		ReplacedAvatar first = userMapper.replaceAvatarKey(id, "avatars/" + id + "/a.png", now).orElseThrow();
		ReplacedAvatar second = userMapper.replaceAvatarKey(id, "avatars/" + id + "/b.png", now).orElseThrow();

		assertThat(first.userId()).isEqualTo(id);
		assertThat(first.oldKey()).isNull();
		assertThat(second.userId()).isEqualTo(id);
		assertThat(second.oldKey()).isEqualTo("avatars/" + id + "/a.png");
		assertThat(userMapper.findById(id).orElseThrow().avatarKey()).isEqualTo("avatars/" + id + "/b.png");
	}

	@Test
	@DisplayName("無い id のアイコン差し替えは空が返る")
	void replaceAvatarKeyOfMissingUserIsEmpty() {
		assertThat(userMapper.replaceAvatarKey(UUID.randomUUID(), "avatars/x/a.png", OffsetDateTime.now(ZoneOffset.UTC)))
				.isEmpty();
	}

	@Test
	@DisplayName("アイコンを差し替えると updated_at が渡した時刻になり、ほかの列は変わらない")
	void replaceAvatarKeySetsUpdatedAt() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));
		User before = userMapper.findById(id).orElseThrow();
		OffsetDateTime later = OffsetDateTime.of(2026, 10, 10, 9, 0, 0, 0, ZoneOffset.UTC);

		userMapper.replaceAvatarKey(id, "avatars/" + id + "/a.png", later);

		User after = userMapper.findById(id).orElseThrow();
		assertThat(after.updatedAt().toInstant()).isEqualTo(later.toInstant());
		assertThat(after.displayName()).isEqualTo(before.displayName());
		assertThat(after.bio()).isEqualTo(before.bio());
		assertThat(after.createdAt().toInstant()).isEqualTo(before.createdAt().toInstant());
	}

	/** 画像 2 枚つきの投稿を 1 件入れ、画像のキーを返す。 */
	private List<String> insertPostWithImages(UUID userId) {
		UUID postId = jdbc.queryForObject("INSERT INTO posts (user_id, body) VALUES (?, '本文') RETURNING id", UUID.class,
				userId);
		List<String> keys = List.of("posts/" + UUID.randomUUID() + ".png", "posts/" + UUID.randomUUID() + ".png");
		for (int position = 0; position < keys.size(); position++) {
			jdbc.update("INSERT INTO post_images (post_id, object_key, position) VALUES (?, ?, ?)", postId,
					keys.get(position), position);
		}
		return keys;
	}

	private int count(String sql, Object... args) {
		Integer count = jdbc.queryForObject(sql, Integer.class, args);
		return count == null ? 0 : count;
	}

	@Test
	@DisplayName("lockById は登録済みの id を返し、知らない id で空")
	void lockByIdReturnsIdOrEmpty() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));

		assertThat(userMapper.lockById(id)).hasValue(id);
		assertThat(userMapper.lockById(UUID.randomUUID())).isEmpty();
	}

	@Test
	@DisplayName("findImageKeysOf はその人の投稿画像とアイコンのキーを返し、他人のキーは含めない")
	void findImageKeysOfReturnsOwnKeysOnly() {
		String s = suffix();
		UUID taro = userMapper.insert(newUser("taro_" + s, "taro_" + s + "@example.com"));
		UUID hanako = userMapper.insert(newUser("hana_" + s, "hana_" + s + "@example.com"));
		OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
		List<String> taroKeys = insertPostWithImages(taro);
		insertPostWithImages(hanako);
		userMapper.replaceAvatarKey(taro, "avatars/" + taro + "/a.png", now);
		userMapper.replaceAvatarKey(hanako, "avatars/" + hanako + "/a.png", now);

		List<String> keys = userMapper.findImageKeysOf(taro);

		assertThat(keys).containsExactlyInAnyOrder(taroKeys.get(0), taroKeys.get(1), "avatars/" + taro + "/a.png");
	}

	@Test
	@DisplayName("findImageKeysOf は画像もアイコンも無い人で空")
	void findImageKeysOfReturnsEmptyWithoutImages() {
		String s = suffix();
		UUID id = userMapper.insert(newUser("user_" + s, "user_" + s + "@example.com"));
		jdbc.update("INSERT INTO posts (user_id, body) VALUES (?, '文字だけ')", id);

		assertThat(userMapper.findImageKeysOf(id)).isEmpty();
	}

	@Test
	@DisplayName("deleteById でその人の投稿・画像の行・リフレッシュトークンも消え、他人の行は残る")
	void deleteByIdCascadesAndLeavesOthers() {
		String s = suffix();
		UUID taro = userMapper.insert(newUser("taro_" + s, "taro_" + s + "@example.com"));
		UUID hanako = userMapper.insert(newUser("hana_" + s, "hana_" + s + "@example.com"));
		for (UUID id : List.of(taro, hanako)) {
			insertPostWithImages(id);
			jdbc.update("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, now() + interval '1 day')",
					id, "hash_" + id);
		}

		int deleted = userMapper.deleteById(taro);

		assertThat(deleted).isEqualTo(1);
		assertThat(userMapper.findById(taro)).isEmpty();
		assertThat(count("SELECT count(*) FROM posts WHERE user_id = ?", taro)).isZero();
		assertThat(count("SELECT count(*) FROM post_images i JOIN posts p ON p.id = i.post_id WHERE p.user_id = ?", taro))
				.isZero();
		assertThat(count("SELECT count(*) FROM refresh_tokens WHERE user_id = ?", taro)).isZero();
		assertThat(userMapper.findById(hanako)).isPresent();
		assertThat(count("SELECT count(*) FROM posts WHERE user_id = ?", hanako)).isEqualTo(1);
		assertThat(count("SELECT count(*) FROM post_images i JOIN posts p ON p.id = i.post_id WHERE p.user_id = ?", hanako))
				.isEqualTo(2);
		assertThat(count("SELECT count(*) FROM refresh_tokens WHERE user_id = ?", hanako)).isEqualTo(1);
		assertThat(userMapper.deleteById(taro)).isZero();
	}

}
