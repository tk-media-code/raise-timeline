package com.tkmedia.raisetimeline.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/** 投稿 1 件に、投稿者の表示に要る列だけを足したもの。{@code users} の {@code email} などは読まない。 */
public record PostWithAuthor(
		UUID id,
		UUID userId,
		String body,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt,
		String username,
		String displayName,
		String avatarKey) {
}
