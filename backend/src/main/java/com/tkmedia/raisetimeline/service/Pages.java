package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.dto.PageResponse;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * 一覧をカーソル方式の 1 ページにする。投稿・コメント・いいねした人・フォローの一覧が同じ打ち切り方をするよう、ここ 1 か所に置く。
 *
 * <p>呼ぶ側は、次のページがあるかを知るために {@code limit} より 1 行多く読んで渡す。
 * 余分な 1 行は返さず、あったことだけを {@code nextCursor}（返す最後の行のカーソル）で知らせる。
 *
 * <p>カーソルにする列は一覧ごとに違う（投稿・コメントは行の id、いいねした人とフォローの一覧は中間テーブルの id）。
 * そのため、行からカーソルを取り出す関数を呼ぶ側が渡す。
 */
final class Pages {

	private Pages() {
	}

	/**
	 * @param rows {@code limit + 1} 行までを読んだ結果
	 * @param cursorOf 行から、その行の次を指すカーソルを取り出す
	 * @param toItems 返す行（{@code limit} 行まで）を、応答の項目にする
	 */
	static <T, R> PageResponse<R> of(List<T> rows, int limit, Function<T, UUID> cursorOf,
			Function<List<T>, List<R>> toItems) {
		if (rows.size() <= limit) {
			return new PageResponse<>(toItems.apply(rows), null);
		}
		List<T> page = rows.subList(0, limit);
		return new PageResponse<>(toItems.apply(page), cursorOf.apply(page.get(limit - 1)));
	}

}
