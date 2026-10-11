package com.tkmedia.raisetimeline.mapper;

import java.util.List;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.tkmedia.raisetimeline.domain.FollowStats;
import com.tkmedia.raisetimeline.domain.UserCardRow;

@Mapper
public interface FollowMapper {

	/**
	 * フォローを 1 行入れ、入れた行数を返す。すでにフォローしていれば何も入れず 0。
	 * 相手か自分が無いときは外部キー違反になる（制約名は {@code follows_followee_id_fkey}・{@code follows_follower_id_fkey}）。
	 * 自分自身を入れると検査の制約に違反する（サービスが先に弾くので、これは最後の守り）。
	 */
	int insert(@Param("followerId") UUID followerId, @Param("followeeId") UUID followeeId);

	/** フォローを消し、消した行数を返す。フォローしていなければ 0。 */
	int delete(@Param("followerId") UUID followerId, @Param("followeeId") UUID followeeId);

	/**
	 * {@code userId} のフォロワー（{@code followee_id = userId} の行の follower）を、{@code follows.id} の降順
	 * （フォローされた順の新しい方から）で {@code limit} 行返す。{@code cursorId} は {@code follows.id}。
	 * {@code cursor} が null でなければ、それより小さい {@code follows.id} の行だけを返す。
	 * 各行の {@code isFollowing} は、{@code viewer} がその行の人をフォローしているか。
	 * {@code limit} は取る行数そのもので、次のページがあるかを知るための +1 は呼ぶ側が足す。
	 */
	List<UserCardRow> findFollowers(@Param("userId") UUID userId, @Param("viewer") UUID viewer,
			@Param("cursor") UUID cursor, @Param("limit") int limit);

	/**
	 * {@code userId} がフォローしている人（{@code follower_id = userId} の行の followee）を返す。
	 * 並び・カーソル・{@code isFollowing}・{@code limit} の扱いは {@link #findFollowers} と同じ。
	 */
	List<UserCardRow> findFollowing(@Param("userId") UUID userId, @Param("viewer") UUID viewer,
			@Param("cursor") UUID cursor, @Param("limit") int limit);

	/**
	 * フォロワー数・フォロー中の数・{@code viewer} が {@code userId} をフォローしているかを、1 文で返す。
	 * 無い利用者でも 0・0・false の 1 行が返る（存在の確認は呼ぶ側の仕事）。
	 */
	FollowStats stats(@Param("userId") UUID userId, @Param("viewer") UUID viewer);

}
