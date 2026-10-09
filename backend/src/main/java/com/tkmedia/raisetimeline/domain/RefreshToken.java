package com.tkmedia.raisetimeline.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * refresh_tokens テーブルの 1 行。トークンそのものは持たず、SHA-256 のハッシュだけを持つ。
 */
public record RefreshToken(
		UUID id,
		UUID userId,
		String tokenHash,
		OffsetDateTime expiresAt,
		OffsetDateTime createdAt) {
}
