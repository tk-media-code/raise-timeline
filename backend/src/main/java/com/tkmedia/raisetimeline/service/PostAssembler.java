package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.LikeCount;
import com.tkmedia.raisetimeline.domain.PostImage;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostImageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.mapper.LikeMapper;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * DB から読んだ投稿を応答の形にする。作成・取得・編集とタイムラインが同じ形を返すよう、組み立てはここ 1 か所にする。
 *
 * <p>画像は、渡された投稿すべての分を 1 回の問い合わせで引いて投稿ごとに振り分ける（投稿ごとに引くと N+1 になる）。
 * URL は DB に持たず、キーから {@link ImageStorage#urlOf} で作る（保存先の設定が変わっても DB を直さずに済む）。
 *
 * <p>いいねの数と「見ている人が付けたか」も、画像と同じく渡された投稿すべての分を 1 回ずつの問い合わせで引く。
 * 1 ページの問い合わせは、本体・画像・いいね数・自分のいいねの 4 本で、投稿の件数によらない。
 * コメントは Issue 8 まで、数に 0 を入れる。
 */
@Component
public class PostAssembler {

	private final PostMapper postMapper;
	private final LikeMapper likeMapper;
	private final ImageStorage imageStorage;

	public PostAssembler(PostMapper postMapper, LikeMapper likeMapper, ImageStorage imageStorage) {
		this.postMapper = postMapper;
		this.likeMapper = likeMapper;
		this.imageStorage = imageStorage;
	}

	/** {@code viewer} は、この応答を見る人（{@code likedByMe} の基準）。 */
	public PostResponse toResponse(PostWithAuthor row, UUID viewer) {
		return toResponses(List.of(row), viewer).get(0);
	}

	public List<PostResponse> toResponses(List<PostWithAuthor> rows, UUID viewer) {
		// 空のページでは問い合わせない（IN () は SQL として成り立たない）。
		if (rows.isEmpty()) {
			return List.of();
		}
		List<UUID> postIds = rows.stream().map(PostWithAuthor::id).toList();
		Map<UUID, List<PostImageResponse>> imagesByPost = imagesOf(postIds);
		// いいねが 1 件も無い投稿は countByPosts に現れないので、無ければ 0 と読む。
		Map<UUID, Long> likeCounts = likeMapper.countByPosts(postIds).stream()
				.collect(Collectors.toMap(LikeCount::postId, LikeCount::count));
		Set<UUID> likedByViewer = Set.copyOf(likeMapper.findLikedPostIds(viewer, postIds));
		return rows.stream()
				.map(row -> assemble(row, imagesByPost.getOrDefault(row.id(), List.of()),
						likeCounts.getOrDefault(row.id(), 0L), likedByViewer.contains(row.id())))
				.toList();
	}

	private Map<UUID, List<PostImageResponse>> imagesOf(List<UUID> postIds) {
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

	private PostResponse assemble(PostWithAuthor row, List<PostImageResponse> images, long likeCount,
			boolean likedByMe) {
		// アイコンを設定していない人は avatarKey が null。そのときは URL も null にする。
		String avatarUrl = row.avatarKey() == null ? null : imageStorage.urlOf(row.avatarKey());
		UserSummary author = new UserSummary(row.userId(), row.username(), row.displayName(), avatarUrl);
		boolean edited = !row.updatedAt().isEqual(row.createdAt());
		return new PostResponse(row.id(), author, row.body(), images, likeCount, 0, likedByMe, edited,
				row.createdAt());
	}

}
