package com.tkmedia.raisetimeline.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * refresh_tokens テーブルの 1 行。トークンそのものは持たず、SHA-256 のハッシュだけを持つ。
 *
 * <p>usedAt は更新に使った時刻。null はまだ使っていない。
 */
public record RefreshToken(
		UUID id,
		UUID userId,
		String tokenHash,
		OffsetDateTime expiresAt,
		OffsetDateTime createdAt,
		OffsetDateTime usedAt) {
}
