package com.tkmedia.raisetimeline.domain;

/**
 * プロフィールに出すフォローの数。{@code isFollowing} は、見ている人がこの人をフォローしているか。
 * 自分のプロフィールを見るときは false になる（自分はフォローできない）。
 */
public record FollowStats(
		long followersCount,
		long followingCount,
		boolean isFollowing) {
}
