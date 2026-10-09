package com.tkmedia.raisetimeline.error;

/**
 * ログインが要るのに、認証が通っていないとみなすときに投げる。401 になる。
 *
 * <p>Bearer が無い・壊れているときは Security が 401 にする。これは、Bearer は有効なのに指す利用者がもう居ない
 * （トークンの有効期間中に退会した）場合など、サービスが認証の失敗と判断するときに使う。
 */
public class UnauthenticatedException extends ApiException {

	private static final long serialVersionUID = 1L;

	public UnauthenticatedException() {
		super(ErrorCode.UNAUTHENTICATED);
	}

}
