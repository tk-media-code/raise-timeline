package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * DB から読んだ投稿を応答の形にする。作成・取得・編集とタイムラインが同じ形を返すよう、組み立てはここ 1 か所にする。
 *
 * <p>画像・いいね・コメントは、それぞれを作る後の Issue まで暫定値を入れる
 * （{@code images} は空、数は 0、{@code likedByMe} は false、{@code avatarUrl} は null）。
 */
@Component
public class PostAssembler {

	public PostResponse toResponse(PostWithAuthor row) {
		UserSummary author = new UserSummary(row.userId(), row.username(), row.displayName(), null);
		boolean edited = !row.updatedAt().isEqual(row.createdAt());
		return new PostResponse(row.id(), author, row.body(), List.of(), 0, 0, false, edited, row.createdAt());
	}

	public List<PostResponse> toResponses(List<PostWithAuthor> rows) {
		return rows.stream().map(this::toResponse).toList();
	}

}
