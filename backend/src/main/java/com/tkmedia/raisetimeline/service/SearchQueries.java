package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.validation.TextRules;
import java.util.List;

/**
 * ユーザー検索の検索語の規則と、{@code ILIKE} に渡すパターンの組み立て。
 *
 * <p>順序: (1) null は空文字 (2) 受け取ったままの値に使えない文字があれば誤り (3) 前後の空白を除く
 * (4) 空なら誤り (5) 50 コードポイントを超えれば誤り。返すのは (3) の後の値。
 *
 * <p>{@code @NotBlank} などの注釈で検査しないのは、{@link CommentBodyRules} と同じ理由。{@code trim()} は全角空白
 * （U+3000）を空白と見ないので、全角空白だけの語が通ってしまう。画面（JS の {@code trim()}）は全角空白を空として扱うので、
 * ここも同じにする。空白の判定は {@link TextRules#stripBlank} で、画面の {@code trim()} が除く文字（U+00A0・U+FEFF など）に
 * そろえる。Java の {@code strip()} は U+00A0 などを除かないので使わない。
 *
 * <p>使えない文字の検査を前後の空白を除く処理より前に置くのは、受け取ったままの値に当てるため（docs/error-handling-design.md。
 * {@link CommentBodyRules} と同じ）。{@code trim()} を使わないのは別の理由で、検査を空白を除く処理の後ろに置いた場合、
 * {@code trim()} は NUL（U+0000）まで消してしまい、使えない文字が検査をすり抜けるため（{@link TextRules#stripBlank} は
 * NUL を消さない）。
 *
 * <p>{@link #containsPattern} が {@code \} を最初に置き換えるのは、先に {@code %} や {@code _} を {@code \%}・{@code \_}
 * にすると、そのとき足した {@code \} まで次の置き換えで二重になるため。
 */
final class SearchQueries {

	static final int MAX_CODE_POINTS = 50;

	static final String REQUIRED = "検索する語を入力してください";
	static final String TOO_LONG = "50 文字以内で入力してください";
	static final String UNUSABLE_CHARS = "使えない文字が含まれています";

	private SearchQueries() {
	}

	/** 前後の空白を除いた検索語を返す。誤りは {@link ValidationException}（field は {@code q}）。 */
	static String validate(String raw) {
		String value = raw == null ? "" : raw;
		if (TextRules.containsUnusableChars(value)) {
			throw invalid(UNUSABLE_CHARS);
		}
		String q = TextRules.stripBlank(value);
		if (q.isEmpty()) {
			throw invalid(REQUIRED);
		}
		if (TextRules.codePointLength(q) > MAX_CODE_POINTS) {
			throw invalid(TOO_LONG);
		}
		return q;
	}

	/** 部分一致の {@code ILIKE} に渡すパターン。{@code \}・{@code %}・{@code _} を文字として探すよう、{@code \} でエスケープする。 */
	static String containsPattern(String q) {
		return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
	}

	private static ValidationException invalid(String message) {
		return new ValidationException(List.of(new FieldError("q", message)));
	}

}
