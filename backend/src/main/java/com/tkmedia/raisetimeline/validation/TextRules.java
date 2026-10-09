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

	/** コードポイントの数。対になっていないサロゲートは 1 と数える。 */
	public static int codePointLength(CharSequence value) {
		return Character.codePointCount(value, 0, value.length());
	}

}
