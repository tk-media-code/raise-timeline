package com.tkmedia.raisetimeline.mapper;

import java.util.List;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.tkmedia.raisetimeline.domain.LikeCount;
import com.tkmedia.raisetimeline.domain.Liker;

@Mapper
public interface LikeMapper {

	/**
	 * いいねを 1 行入れ、入れた行数を返す。すでに付けていれば何も入れず 0。
	 * 投稿か利用者が無いときは外部キー違反になる（制約名は {@code likes_post_id_fkey}・{@code likes_user_id_fkey}）。
	 */
	int insert(@Param("postId") UUID postId, @Param("userId") UUID userId);

	/** いいねを消し、消した行数を返す。付けていなければ 0。 */
	int delete(@Param("postId") UUID postId, @Param("userId") UUID userId);

	/**
	 * 投稿ごとのいいね数を 1 回の問い合わせで返す。いいねが 1 件以上ある投稿だけが返る。
	 * {@code postIds} は空にしない（空だと SQL が成り立たない。呼ぶ側が空では呼ばない）。
	 */
	List<LikeCount> countByPosts(@Param("postIds") List<UUID> postIds);

	/**
	 * {@code postIds} のうち、{@code userId} がいいねしている投稿の id を返す。
	 * {@code postIds} は空にしない（空だと SQL が成り立たない。呼ぶ側が空では呼ばない）。
	 */
	List<UUID> findLikedPostIds(@Param("userId") UUID userId, @Param("postIds") List<UUID> postIds);

	/**
	 * 投稿にいいねした人を、{@code likes.id} の降順（付けた順の新しい方から）で {@code limit} 行返す。
	 * {@code cursor} が null でなければ、それより小さい {@code likes.id} の行だけを返す。
	 * {@code limit} は取る行数そのもので、次のページがあるかを知るための +1 は呼ぶ側が足す。
	 */
	List<Liker> findLikers(@Param("postId") UUID postId, @Param("cursor") UUID cursor, @Param("limit") int limit);

}
