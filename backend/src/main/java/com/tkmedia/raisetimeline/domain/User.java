package com.tkmedia.raisetimeline.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * users テーブルの 1 行。
 *
 * <p>新規登録のときは {@code id} を {@code null} にして渡す。id は DB の {@code uuidv7()} が採番する。
 */
public record User(
		UUID id,
		String username,
		String displayName,
		String email,
		String passwordHash,
		String bio,
		String avatarKey,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
