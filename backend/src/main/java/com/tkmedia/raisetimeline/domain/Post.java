package com.tkmedia.raisetimeline.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * posts テーブルの 1 行。
 *
 * <p>新規投稿のときは {@code id} を {@code null} にして渡す。id は DB の {@code uuidv7()} が採番する。
 */
public record Post(
		UUID id,
		UUID userId,
		String body,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
