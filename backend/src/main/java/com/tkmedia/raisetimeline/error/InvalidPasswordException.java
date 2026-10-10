package com.tkmedia.raisetimeline.error;

/** 退会のとき、確認のために再入力されたパスワードが違うときに投げる。401 になる。 */
public class InvalidPasswordException extends ApiException {

	private static final long serialVersionUID = 1L;

	public InvalidPasswordException() {
		super(ErrorCode.INVALID_PASSWORD);
	}

}
