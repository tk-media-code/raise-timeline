package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.error.BadRequestException;

/**
 * 一覧の API が受け取る {@code limit} の既定値と上限。
 *
 * <p>検査を Bean Validation の {@code @Min} / {@code @Max} にしないのは、あれが投げる制約違反を
 * 422（入力の誤り）に変えて返す経路と、型が合わない {@code limit=abc} の 400 とが混ざるため。
 * 範囲外も型違いも「要求の形が正しくない」ので、どちらも 400 にそろえる。
 */
final class PageLimits {

	/** {@code limit} を省いたときの件数。{@code @RequestParam(defaultValue)} には文字列で渡す。 */
	static final int DEFAULT = 20;
	static final String DEFAULT_VALUE = "" + DEFAULT;
	static final int MAX = 50;

	private PageLimits() {
	}

	/** 1 以上 {@link #MAX} 以下ならそのまま返し、外れていれば {@link BadRequestException}。 */
	static int check(int limit) {
		if (limit < 1 || limit > MAX) {
			throw new BadRequestException();
		}
		return limit;
	}

}
