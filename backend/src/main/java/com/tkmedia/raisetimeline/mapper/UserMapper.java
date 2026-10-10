package com.tkmedia.raisetimeline.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.tkmedia.raisetimeline.domain.ReplacedAvatar;
import com.tkmedia.raisetimeline.domain.User;

@Mapper
public interface UserMapper {

	/** 利用者を 1 行入れ、DB が採番した id を返す。 */
	UUID insert(User user);

	Optional<User> findById(UUID id);

	/** 大文字小文字を区別せずに引く。 */
	Optional<User> findByEmail(String email);

	/** 大文字小文字を区別せずに引く。 */
	Optional<User> findByUsername(String username);

	boolean existsByUsername(String username);

	boolean existsByEmail(String email);

	/** 行があるか。アクセストークンを受けるたびに引くので、列を読まず主キーの有無だけを確かめる。 */
	boolean existsById(UUID id);

	/**
	 * 表示名・自己紹介・更新日時を変え、更新後の行を返す。無い id では空。ほかの列は触らない。
	 * 更新後の行は同じ文の {@code RETURNING} が返す（更新してから読み直すと、その間に行が消えたとき更新と読み取りの結果がずれる）。
	 */
	Optional<User> updateProfile(@Param("id") UUID id, @Param("displayName") String displayName, @Param("bio") String bio,
			@Param("updatedAt") OffsetDateTime updatedAt);

	/**
	 * アイコンのキーと更新日時を変え、差し替え前のキーを返す。無い id では空。ほかの列は触らない。
	 * 差し替え前のキーは同じ文の中で {@code RETURNING OLD} が返す（読んでから書くと、同時に 2 回差し替えたとき
	 * 同じ古いキーを二人が拾って、片方の画像が消されずに残る）。
	 */
	Optional<ReplacedAvatar> replaceAvatarKey(@Param("id") UUID id, @Param("key") String key,
			@Param("updatedAt") OffsetDateTime updatedAt);

	/**
	 * 行を {@code FOR UPDATE} で押さえ、あれば id を返す。無い id では空。
	 * 退会が、同じ人の進行中の投稿やアイコンの更新（外部キーの検査が行を共有ロックする）を待つために使う。
	 */
	Optional<UUID> lockById(UUID id);

	/**
	 * その人の S3 のキー（投稿の画像と、設定していればアイコン）。行を消すと連鎖して画像の行も消えるので、
	 * 消す前に集める。順は決まっていない。
	 */
	List<String> findImageKeysOf(UUID userId);

	/** 行を消し、消した行数を返す。投稿・画像の行・リフレッシュトークンは外部キーの連鎖で一緒に消える。 */
	int deleteById(UUID id);

}
