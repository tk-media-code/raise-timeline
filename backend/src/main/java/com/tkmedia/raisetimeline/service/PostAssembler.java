package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.PostImage;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostImageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * DB から読んだ投稿を応答の形にする。作成・取得・編集とタイムラインが同じ形を返すよう、組み立てはここ 1 か所にする。
 *
 * <p>画像は、渡された投稿すべての分を 1 回の問い合わせで引いて投稿ごとに振り分ける（投稿ごとに引くと N+1 になる）。
 * URL は DB に持たず、キーから {@link ImageStorage#urlOf} で作る（保存先の設定が変わっても DB を直さずに済む）。
 *
 * <p>いいね・コメントは、それぞれを作る後の Issue まで暫定値を入れる（数は 0、{@code likedByMe} は false）。
 */
@Component
public class PostAssembler {

	private final PostMapper postMapper;
	private final ImageStorage imageStorage;

	public PostAssembler(PostMapper postMapper, ImageStorage imageStorage) {
		this.postMapper = postMapper;
		this.imageStorage = imageStorage;
	}

	public PostResponse toResponse(PostWithAuthor row) {
		return toResponses(List.of(row)).get(0);
	}

	public List<PostResponse> toResponses(List<PostWithAuthor> rows) {
		// 空のページでは問い合わせない（IN () は SQL として成り立たない）。
		if (rows.isEmpty()) {
			return List.of();
		}
		Map<UUID, List<PostImageResponse>> imagesByPost = imagesOf(rows);
		return rows.stream()
				.map(row -> toResponse(row, imagesByPost.getOrDefault(row.id(), List.of())))
				.toList();
	}

	private Map<UUID, List<PostImageResponse>> imagesOf(List<PostWithAuthor> rows) {
		List<UUID> postIds = rows.stream().map(PostWithAuthor::id).toList();
		Map<UUID, List<PostImageResponse>> imagesByPost = new HashMap<>();
		// findImages は post_id, position の順で返すので、投稿ごとの並びは position の順になる。
		for (PostImage image : postMapper.findImages(postIds)) {
			String url = imageStorage.urlOf(image.objectKey());
			// 保存先が使えない環境では URL を作れない。壊れたリンクを返すより、その画像を省く。
			if (url == null) {
				continue;
			}
			imagesByPost.computeIfAbsent(image.postId(), id -> new ArrayList<>())
					.add(new PostImageResponse(image.id(), url));
		}
		return imagesByPost;
	}

	private PostResponse toResponse(PostWithAuthor row, List<PostImageResponse> images) {
		// アイコンを設定していない人は avatarKey が null。そのときは URL も null にする。
		String avatarUrl = row.avatarKey() == null ? null : imageStorage.urlOf(row.avatarKey());
		UserSummary author = new UserSummary(row.userId(), row.username(), row.displayName(), avatarUrl);
		boolean edited = !row.updatedAt().isEqual(row.createdAt());
		return new PostResponse(row.id(), author, row.body(), images, 0, 0, false, edited, row.createdAt());
	}

}
