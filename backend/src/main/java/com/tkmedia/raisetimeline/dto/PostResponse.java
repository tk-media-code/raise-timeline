package com.tkmedia.raisetimeline.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 投稿 1 件の応答。{@code likeCount}・{@code commentCount}・{@code likedByMe}・{@code images} は、
 * それぞれを作る後の Issue（画像 5、いいね 7、コメント 8）まで暫定値を入れる。
 */
public record PostResponse(
		UUID id,
		UserSummary author,
		String body,
		List<PostImageResponse> images,
		long likeCount,
		long commentCount,
		boolean likedByMe,
		boolean edited,
		OffsetDateTime createdAt) {
}
