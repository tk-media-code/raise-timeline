package com.tkmedia.raisetimeline.validation;

import java.util.regex.Pattern;

/**
 * ユーザー名の規則。登録の検証と、URL のユーザー名を DB に渡してよいかの判断が、同じ規則を見るようここ 1 か所に置く。
 *
 * <p>URL のユーザー名は利用者が自由に書き換えられる。NUL（{@code \u0000}）を含む値を PostgreSQL に渡すと
 * エラーで 500 になるので、規則に合わない名前は DB に問い合わせず「いない」ものとして扱う
 * （規則に合わない名前の人は登録できないので、存在しない）。
 */
public final class Usernames {

	/** 3〜20 文字の英数字と {@code _}。{@code @Pattern} には定数の文字列で渡す。 */
	public static final String PATTERN = "^[A-Za-z0-9_]{3,20}$";

	private static final Pattern COMPILED = Pattern.compile(PATTERN);

	private Usernames() {
	}

	/**
	 * 規則に合えば true。null は false。{@code $} は末尾の改行の手前にも合う（{@code "abc\n"}）ので、
	 * {@code matches()} で全体の一致を求める。
	 */
	public static boolean isWellFormed(String value) {
		return value != null && COMPILED.matcher(value).matches();
	}

}
