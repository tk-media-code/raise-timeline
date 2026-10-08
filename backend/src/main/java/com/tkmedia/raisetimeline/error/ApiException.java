package com.tkmedia.raisetimeline.error;

import java.util.List;

/**
 * 業務の都合で返すエラー。サービス層が投げ、{@link ApiExceptionHandler} が Problem Details に変える。
 *
 * <p>抽象クラスにしているのは、{@link ErrorCode} を直接渡して投げず、
 * 「見つからない」「重複」のような意味のある名前の派生を通させるため。派生は投げる機能の Issue で足す。
 */
public abstract class ApiException extends RuntimeException {

	private static final long serialVersionUID = 1L;

	private final ErrorCode code;
	private final List<FieldError> errors;

	protected ApiException(ErrorCode code) {
		this(code, List.of());
	}

	protected ApiException(ErrorCode code, List<FieldError> errors) {
		// 文言は code の名前だけにする。万一どこかに漏れても害の無い値で、利用者向けの文言は ErrorCode が持つ。
		super(code.name());
		this.code = code;
		this.errors = List.copyOf(errors);
	}

	public ErrorCode code() {
		return code;
	}

	public List<FieldError> errors() {
		return errors;
	}

}
