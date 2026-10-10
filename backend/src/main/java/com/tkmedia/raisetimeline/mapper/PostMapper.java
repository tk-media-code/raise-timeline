package com.tkmedia.raisetimeline.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.PostImage;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;

@Mapper
public interface PostMapper {

	/** 投稿を 1 行入れ、DB が採番した id を返す。 */
	UUID insert(Post post);

	Optional<PostWithAuthor> findById(@Param("id") UUID id);

	/** 投稿があるか。いいねの付け外しと「いいねした人」の一覧が、投稿が無いこと（404）と 0 件を区別するために使う。 */
	boolean existsById(@Param("id") UUID id);

	/** 本文と更新日時を変え、変えた行数を返す。無い id では 0。 */
	int updateBody(@Param("id") UUID id, @Param("body") String body, @Param("updatedAt") OffsetDateTime updatedAt);

	/** 投稿を消し（画像の行も一緒に消える）、消した行数を返す。無い id では 0。 */
	int delete(@Param("id") UUID id);

	/**
	 * 新しい順に {@code limit} 行を返す。{@code cursor} が null でなければ、それより古い（id が小さい）行だけを返す。
	 * {@code limit} は取る行数そのもので、次のページがあるかを知るための +1 は呼ぶ側が足す。
	 */
	List<PostWithAuthor> findAll(@Param("cursor") UUID cursor, @Param("limit") int limit);

	/**
	 * {@code userId} の投稿だけを、{@link #findAll} と同じ並びと打ち切り方で返す。
	 * {@code limit} は取る行数そのもので、次のページがあるかを知るための +1 は呼ぶ側が足す。
	 */
	List<PostWithAuthor> findByUser(@Param("userId") UUID userId, @Param("cursor") UUID cursor,
			@Param("limit") int limit);

	/**
	 * 投稿に画像の行を入れる。{@code position} は {@code keys} の並びの番号（0 から）で、送られた順をそのまま保つ。
	 * {@code keys} は 1 件以上、4 件まで（空だと SQL が成り立たない。呼ぶ側が空では呼ばない）。
	 */
	void insertImages(@Param("postId") UUID postId, @Param("keys") List<String> keys);

	/**
	 * 指定の投稿の画像を、{@code post_id, position} の順で返す。一覧の画像を 1 回の問い合わせで引くために、
	 * 投稿の id をまとめて渡す。{@code postIds} は空にしない（空だと SQL が成り立たない）。
	 */
	List<PostImage> findImages(@Param("postIds") List<UUID> postIds);

	/** 1 つの投稿の画像のキーを {@code position} の順で返す。投稿の削除と編集が、画像の有無やキーを知るために使う。 */
	List<String> findImageKeys(@Param("postId") UUID postId);

}
