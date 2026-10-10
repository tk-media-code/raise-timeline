package com.tkmedia.raisetimeline.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/** コメント 1 件に、書いた人の表示に要る列だけを足したもの。{@code users} の {@code email} などは読まない。 */
public record CommentWithAuthor(
		UUID id,
		UUID postId,
		UUID userId,
		String body,
		OffsetDateTime createdAt,
		String username,
		String displayName,
		String avatarKey) {
}
