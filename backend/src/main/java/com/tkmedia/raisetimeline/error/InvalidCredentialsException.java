package com.tkmedia.raisetimeline.error;

/** メールアドレスかパスワードが違うときに投げる。どちらが違うかは区別しない。401 になる。 */
public class InvalidCredentialsException extends ApiException {

	private static final long serialVersionUID = 1L;

	public InvalidCredentialsException() {
		super(ErrorCode.INVALID_CREDENTIALS);
	}

}
