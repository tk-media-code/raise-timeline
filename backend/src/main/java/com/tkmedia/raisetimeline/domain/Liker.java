package com.tkmedia.raisetimeline.domain;

import java.util.UUID;

/**
 * 「いいねした人」の一覧の 1 行。{@code likeId} は並びとカーソルに使う {@code likes.id}。
 * {@code users} からは表示に要る列だけを読み、{@code email} と {@code password_hash} は読まない。
 */
public record Liker(
		UUID likeId,
		UUID userId,
		String username,
		String displayName,
		String avatarKey,
		String bio) {
}
