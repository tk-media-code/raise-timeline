package com.tkmedia.raisetimeline.domain;

import java.util.UUID;

/**
 * 利用者を並べる一覧（いいねした人・フォロワー・フォロー中）の 1 行。
 *
 * <p>{@code cursorId} は並びとカーソルに使う中間テーブルの id（{@code likes.id}・{@code follows.id}）。
 * {@code isFollowing} は、ログイン中の利用者がこの行の人をフォローしているか。
 * {@code users} からは表示に要る列だけを読み、{@code email} と {@code password_hash} は読まない。
 */
public record UserCardRow(
		UUID cursorId,
		UUID userId,
		String username,
		String displayName,
		String avatarKey,
		String bio,
		boolean isFollowing) {
}
