package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.validation.TextRules;
import java.util.List;

/**
 * コメントの本文の規則。
 *
 * <p>順序: (1) null は空文字 (2) 使えない文字 (3) CRLF を LF に (4) {@code strip()} で空になる
 * (5) 280 コードポイントを超える。返すのは (3) の後の値で、前後の空白は残す。
 *
 * <p>Bean Validation の注釈で検査しないのは、{@code @NotBlank} が {@code trim()} で空を判定するため。
 * {@code trim()} は全角空白（U+3000）を空白と見ないので、全角空白だけの本文が通ってしまう。画面（JS の
 * {@code trim()}）と投稿（{@link PostBodyRules}）は全角空白を空として扱うので、ここも {@code strip()} にそろえる。
 * 注釈の長さ検査は UTF-16 の文字数で数えるので、絵文字も 2 文字になる。
 *
 * <p>使えない文字の検査を (3) より前に置くのは、受け取ったままの文字列に当てるため
 * （docs/error-handling-design.md）。{@link PostBodyRules} と違い、空は画像で補えないので常に誤りになる。
 */
public final class CommentBodyRules {

	static final int MAX_CODE_POINTS = 280;

	static final String TOO_SHORT_OR_LONG = "1〜280 文字で入力してください";
	static final String UNUSABLE_CHARS = "使えない文字が含まれています";

	private CommentBodyRules() {
	}

	/** 正規化した本文を返す。誤りは {@link ValidationException}（field は {@code body}）。 */
	public static String validate(String raw) {
		String body = raw == null ? "" : raw;
		if (TextRules.containsUnusableChars(body)) {
			throw invalid(UNUSABLE_CHARS);
		}
		// 正規化は 1 回だけ行い、その結果を数えるのにも返すのにも使う。2 回かけると "\r\r\n" のような入力で結果が変わる。
		body = TextRules.normalizeNewlines(body);
		if (body.strip().isEmpty() || TextRules.codePointLength(body) > MAX_CODE_POINTS) {
			throw invalid(TOO_SHORT_OR_LONG);
		}
		return body;
	}

	private static ValidationException invalid(String message) {
		return new ValidationException(List.of(new FieldError("body", message)));
	}

}
