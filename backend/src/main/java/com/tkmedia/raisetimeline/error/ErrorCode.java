package com.tkmedia.raisetimeline.error;

import org.springframework.http.HttpStatus;

/**
 * エラー応答の分類。画面は {@code code} の文字列で処理を分岐するので、名前を変えると画面が壊れる。
 * status と文言は code とセットで決めておき、例外の文言から本文を作らない（内部の情報が漏れないように）。
 *
 * <p>ここにあるのは基盤が使う値だけ。認証以降の値は、それを投げる機能の Issue で足す。
 */
public enum ErrorCode {

	BAD_REQUEST(HttpStatus.BAD_REQUEST, "要求の形式が正しくありません"),
	NOT_FOUND(HttpStatus.NOT_FOUND, "見つかりません"),
	METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "この操作は受け付けていません"),
	UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "要求の形式が正しくありません"),
	VALIDATION_ERROR(HttpStatus.UNPROCESSABLE_CONTENT, "入力内容に誤りがあります"),
	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "問題が起きました。時間をおいて再試行してください");

	private final HttpStatus status;
	private final String message;

	ErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	public HttpStatus status() {
		return status;
	}

	/** 利用者に見せる固定の文言。{@code title} と {@code detail} の両方に使う。 */
	public String message() {
		return message;
	}

}
