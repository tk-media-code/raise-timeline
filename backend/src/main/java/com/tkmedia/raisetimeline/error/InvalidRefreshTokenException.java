package com.tkmedia.raisetimeline.error;

/** リフレッシュトークンが無効（期限切れ・失効・不明）のときに投げる。401 になる。 */
public class InvalidRefreshTokenException extends ApiException {

	private static final long serialVersionUID = 1L;

	public InvalidRefreshTokenException() {
		super(ErrorCode.INVALID_REFRESH_TOKEN);
	}

}
