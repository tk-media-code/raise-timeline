package com.tkmedia.raisetimeline.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 投稿 1 件の応答。{@code likeCount}・{@code commentCount}・{@code likedByMe} は、
 * それぞれを作る後の Issue（いいね 7、コメント 8）まで暫定値を入れる。{@code images} は表示の順で、無ければ空。
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
