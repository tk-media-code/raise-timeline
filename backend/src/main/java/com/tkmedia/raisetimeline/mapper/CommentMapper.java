package com.tkmedia.raisetimeline.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.tkmedia.raisetimeline.domain.CommentCount;
import com.tkmedia.raisetimeline.domain.CommentWithAuthor;

@Mapper
public interface CommentMapper {

	/**
	 * コメントを 1 行入れ、DB が採番した id を返す。
	 * 投稿か利用者が無いときは外部キー違反になる（制約名は {@code comments_post_id_fkey}・{@code comments_user_id_fkey}）。
	 */
	UUID insert(@Param("postId") UUID postId, @Param("userId") UUID userId, @Param("body") String body,
			@Param("createdAt") OffsetDateTime createdAt);

	Optional<CommentWithAuthor> findById(@Param("id") UUID id);

	/**
	 * 投稿のコメントを、{@code comments.id} の降順（新しい方から）で {@code limit} 行返す。
	 * {@code cursor} が null でなければ、それより小さい id の行だけを返す。
	 * {@code limit} は取る行数そのもので、次のページがあるかを知るための +1 は呼ぶ側が足す。
	 */
	List<CommentWithAuthor> findByPost(@Param("postId") UUID postId, @Param("cursor") UUID cursor,
			@Param("limit") int limit);

	/** コメントを消し、消した行数を返す。無い id では 0。 */
	int delete(@Param("id") UUID id);

	/**
	 * 投稿ごとのコメント数を 1 回の問い合わせで返す。コメントが 1 件以上ある投稿だけが返る。
	 * {@code postIds} は空にしない（空だと SQL が成り立たない。呼ぶ側が空では呼ばない）。
	 */
	List<CommentCount> countByPosts(@Param("postIds") List<UUID> postIds);

}
