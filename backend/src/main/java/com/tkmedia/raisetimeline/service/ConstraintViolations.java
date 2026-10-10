package com.tkmedia.raisetimeline.service;

import org.springframework.dao.DataIntegrityViolationException;

/**
 * 制約違反が、どの制約によるものかを見分ける。
 *
 * <p>制約の名前は、PostgreSQL が違反の理由として返すメッセージ（最も深い原因）に入っている。
 * 外部キーは既定の名前 {@code <テーブル>_<列>_fkey} で作っているので、名前を含むかどうかで、どの列への
 * 違反かが分かる（docs/error-handling-design.md 3 章「例外の変換」）。
 * どの例外にするか、知らない制約をどうするかは、呼ぶ側が決める。
 */
final class ConstraintViolations {

	private ConstraintViolations() {
	}

	/** 最も深い原因のメッセージがあり、{@code constraintName} を含むなら true。 */
	static boolean violates(DataIntegrityViolationException e, String constraintName) {
		String message = e.getMostSpecificCause().getMessage();
		return message != null && message.contains(constraintName);
	}

}
