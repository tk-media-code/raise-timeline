package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import java.util.List;
import java.util.UUID;

/**
 * 投稿の一覧をカーソル方式の 1 ページにする。タイムラインとその人の投稿一覧が同じ打ち切り方をするよう、ここ 1 か所に置く。
 *
 * <p>呼ぶ側は、次のページがあるかを知るために {@code limit} より 1 行多く読んで渡す。
 * 余分な 1 行は返さず、あったことだけを {@code nextCursor}（返す最後の投稿の id）で知らせる。
 */
final class PostPages {

	private PostPages() {
	}

	static PageResponse<PostResponse> of(List<PostWithAuthor> rows, int limit, PostAssembler assembler, UUID viewer) {
		if (rows.size() <= limit) {
			return new PageResponse<>(assembler.toResponses(rows, viewer), null);
		}
		List<PostWithAuthor> page = rows.subList(0, limit);
		return new PageResponse<>(assembler.toResponses(page, viewer), page.get(limit - 1).id());
	}

}
