package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.validation.TextRules;
import java.util.List;

/**
 * 投稿の本文の規則。投稿と編集が同じ判定を通るよう、1 か所にまとめる。
 *
 * <p>順序: (1) null は空文字 (2) 使えない文字 (3) CRLF を LF に (4) {@code strip()} で空になるなら空文字
 * (5) 280 コードポイントを超える (6) 空で画像も無い。
 *
 * <p>使えない文字の検査を (3) より前に置くのは、受け取ったままの文字列に当てるため
 * （docs/error-handling-design.md）。(4) の空白だけの本文を空として扱うのは、利用者から見て空だから。
 * それ以外の本文は、前後の空白も含めて入力のまま返す。
 */
public final class PostBodyRules {

	static final int MAX_CODE_POINTS = 280;

	static final String UNUSABLE_CHARS = "使えない文字が含まれています";
	static final String TOO_LONG = "280 文字以内で入力してください";
	static final String EMPTY = "本文か画像を入れてください";

	private PostBodyRules() {
	}

	/** 正規化した本文を返す。誤りは {@link ValidationException}（field は {@code body}）。 */
	public static String validate(String raw, boolean hasImages) {
		String body = raw == null ? "" : raw;
		if (TextRules.containsUnusableChars(body)) {
			throw invalid(UNUSABLE_CHARS);
		}
		// 正規化は 1 回だけ行い、その結果を数えるのにも返すのにも使う。2 回かけると "\r\r\n" のような入力で結果が変わる。
		body = TextRules.normalizeNewlines(body);
		if (body.strip().isEmpty()) {
			body = "";
		}
		if (TextRules.codePointLength(body) > MAX_CODE_POINTS) {
			throw invalid(TOO_LONG);
		}
		if (body.isEmpty() && !hasImages) {
			throw invalid(EMPTY);
		}
		return body;
	}

	private static ValidationException invalid(String message) {
		return new ValidationException(List.of(new FieldError("body", message)));
	}

}
