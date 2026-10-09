package com.tkmedia.raisetimeline.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 他人にも見せる利用者の公開情報（プロフィール画面）。{@link Me} と違って {@code email} を持たない。
 * メールアドレスを返してよいのは本人向けの {@link Me} だけで、型を分けることで取り違えを防ぐ。
 *
 * <p>{@code isFollowing} と {@code isMe} は、Jackson が Java の規約で {@code following} と {@code me} に
 * 変えてしまわないよう、名前を明示する。
 */
public record UserDetail(
		UUID id,
		String username,
		String displayName,
		String avatarUrl,
		String bio,
		@JsonProperty("isFollowing") boolean isFollowing,
		long followersCount,
		long followingCount,
		OffsetDateTime createdAt,
		@JsonProperty("isMe") boolean isMe) {
}
