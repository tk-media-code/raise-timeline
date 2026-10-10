package com.tkmedia.raisetimeline.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.UUID;

/**
 * 一覧に並べる利用者 1 人分（いいねした人など）。{@link UserDetail} と同じく {@code email} を持たない。
 *
 * <p>{@code isFollowing} は、Jackson が Java の規約で {@code following} に変えてしまわないよう、名前を明示する。
 * フォローの機能ができるまでは常に false。
 */
public record UserCard(
		UUID id,
		String username,
		String displayName,
		String avatarUrl,
		String bio,
		@JsonProperty("isFollowing") boolean isFollowing) {
}
