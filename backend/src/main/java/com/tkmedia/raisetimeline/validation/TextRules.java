package com.tkmedia.raisetimeline.validation;

/**
 * 利用者が入れた文字列の扱いを、検証と保存のあいだで揃えるための規則。
 */
public final class TextRules {

	private TextRules() {
	}

	/**
	 * PostgreSQL に保存できない文字（NUL と、対になっていないサロゲート）を含むか。
	 *
	 * <p>対になっていないサロゲートは UTF-8 にできず、保存の途中で「?」に置き換わる。JSON のエスケープ（U+D800 など）
	 * からしか生まれない。{@code null} は含まないものとして扱う。
	 */
	public static boolean containsUnusableChars(CharSequence value) {
		if (value == null) {
			return false;
		}
		int length = value.length();
		for (int i = 0; i < length; i++) {
			char c = value.charAt(i);
			if (c == '\u0000') {
				return true;
			}
			if (Character.isHighSurrogate(c)) {
				if (i + 1 < length && Character.isLowSurrogate(value.charAt(i + 1))) {
					i++;
				}
				else {
					return true;
				}
			}
			else if (Character.isLowSurrogate(c)) {
				return true;
			}
		}
		return false;
	}

	/** {@code \r\n} を {@code \n} にする。単独の {@code \r} は変えない。{@code null} は {@code null}。 */
	public static String normalizeNewlines(String value) {
		return value == null ? null : value.replace("\r\n", "\n");
	}

	/**
	 * 前後から取り除く空白の文字か。画面（JS の {@code trim()}）が除く文字にそろえる。
	 *
	 * <p>Java の {@code String.strip()} は {@code Character.isWhitespace} で判定するので、U+00A0・U+2007・U+202F
	 * （改行しない空白）と U+FEFF は除かない。{@code trim()} が除くこれらを足して、画面と API で「空」の判定が
	 * ずれないようにする。U+200B のような幅の無い文字は {@code trim()} も除かないので、空白に含めない。
	 *
	 * <p>画面と完全には一致しない。{@code Character.isWhitespace} 由来で、U+001C〜U+001F（区切りの制御文字）も除く。
	 * 画面はこれらを除かないので、サーバーの方が少し広い（これらだけの本文は、画面ではボタンが押せ、サーバーが 422 にする）。
	 */
	public static boolean isBlankChar(char c) {
		return Character.isWhitespace(c) || Character.isSpaceChar(c) || c == '\uFEFF';
	}

	/** 前後の空白の文字（{@link #isBlankChar}）を除く。中の空白は残す。{@code null} は {@code null}。 */
	public static String stripBlank(String value) {
		if (value == null) {
			return null;
		}
		int start = 0;
		int end = value.length();
		while (start < end && isBlankChar(value.charAt(start))) {
			start++;
		}
		while (end > start && isBlankChar(value.charAt(end - 1))) {
			end--;
		}
		return value.substring(start, end);
	}

	/** 空白の文字だけ、または空か。{@code null} も空として扱う。 */
	public static boolean isBlank(String value) {
		return value == null || stripBlank(value).isEmpty();
	}

	/** コードポイントの数。対になっていないサロゲートは 1 と数える。 */
	public static int codePointLength(CharSequence value) {
		return Character.codePointCount(value, 0, value.length());
	}

}
