package com.tkmedia.raisetimeline.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 利用者の公開情報。{@code isFollowing} と {@code isMe} は、Jackson が Java の規約で {@code following} と
 * {@code me} に変えてしまわないよう、名前を明示する。
 */
public record Me(
		UUID id,
		String username,
		String displayName,
		String avatarUrl,
		String bio,
		@JsonProperty("isFollowing") boolean isFollowing,
		long followersCount,
		long followingCount,
		OffsetDateTime createdAt,
		@JsonProperty("isMe") boolean isMe,
		String email) {
}
