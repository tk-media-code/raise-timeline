package com.tkmedia.raisetimeline.error;

import com.tkmedia.raisetimeline.web.RequestLogFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 例外を Problem Details に変える唯一の場所。
 *
 * <p>{@link ResponseEntityExceptionHandler} を継承するのは、Spring が投げる例外（壊れた JSON、メソッド違い、
 * 存在しない URL など）も同じ形にするため。それらは {@code handleExceptionInternal} を通るので、
 * そこを上書きして全部この形に寄せる。どの経路も {@link #respond} に集め、code の記録と 500 のログを 1 か所で行う。
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	/**
	 * 束縛の失敗（型が合わない入力）で errors に入れる固定の文。
	 * Spring の文言には Java の型名と送られた値が入る（"Failed to convert ... java.lang.Integer ..."）ので、
	 * 本文に載せない。画面が項目の下にそのまま出せる日本語にしておく。
	 */
	private static final String BINDING_FAILURE_MESSAGE = "入力の形式が正しくありません";

	@ExceptionHandler(ApiException.class)
	public ResponseEntity<Object> handleApiException(ApiException ex, WebRequest request) {
		return respond(ex, ex.code(), ex.errors(), new HttpHeaders(), request);
	}

	/**
	 * 形の壊れた multipart（boundary が無い、途中で切れているなど）は利用者の入力の誤りなので、400 にして ERROR は書かない。
	 * 500 にすると、利用者の操作で ERROR を起こせてしまう（docs/error-handling-design.md 2 章「multipart に必要な部品が無い → 400」）。
	 * {@code MaxUploadSizeExceededException} は派生なので、親クラスの専用の処理が優先される（最も近い型が選ばれる）。
	 */
	@ExceptionHandler(MultipartException.class)
	public ResponseEntity<Object> handleMalformedMultipart(MultipartException ex, WebRequest request) {
		return respond(ex, ErrorCode.BAD_REQUEST, List.of(), new HttpHeaders(), request);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) {
		return respond(ex, ErrorCode.INTERNAL_ERROR, List.of(), new HttpHeaders(), request);
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
				.map(e -> new FieldError(e.getField(), e.isBindingFailure() ? BINDING_FAILURE_MESSAGE : e.getDefaultMessage()))
				// 1 つの項目に複数の注釈が当たって同じ文言が重なるとき（空文字が @NotBlank と @Pattern の両方に当たる等）、1 件にする。
				.distinct()
				.toList();
		return respond(ex, ErrorCode.VALIDATION_ERROR, errors, headers, request);
	}

	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
			HttpStatusCode statusCode, WebRequest request) {
		return respond(ex, codeOf(statusCode), List.of(), headers, request);
	}

	/** Spring が決めた status を、画面が分岐に使う code に対応づける。表に無い 4xx は BAD_REQUEST に寄せる。 */
	private static ErrorCode codeOf(HttpStatusCode status) {
		return switch (status.value()) {
			case 404 -> ErrorCode.NOT_FOUND;
			case 405 -> ErrorCode.METHOD_NOT_ALLOWED;
			case 413 -> ErrorCode.FILE_TOO_LARGE;
			case 415 -> ErrorCode.UNSUPPORTED_MEDIA_TYPE;
			default -> status.is5xxServerError() ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
		};
	}

	private ResponseEntity<Object> respond(Exception ex, ErrorCode code, List<FieldError> errors, HttpHeaders headers,
			WebRequest webRequest) {
		HttpServletRequest request = ((ServletWebRequest) webRequest).getRequest();
		// クライアントの切断はこちらの失敗ではない。ERROR にも code にもせず、何も書かずに処理済みとする。
		// Jackson は書き込み中の IOException も HttpMessageNotWritableException に包むので、
		// status だけで見ると切断が 500 になり、本番で誤報の ERROR が出てしまう。
		if (ClientDisconnects.isClientDisconnect(ex)) {
			return null;
		}
		RequestLogFilter.setErrorCode(request, code.name());
		if (code == ErrorCode.INTERNAL_ERROR) {
			InternalErrorLog.write(ex);
		}
		// 応答が確定済みなら本文は足せない（足すと壊れた応答になる）。
		// 確定後の本物の失敗は、上の ERROR と code で見えるようにしてある。null は「処理済み」の意味。
		HttpServletResponse response = ((ServletWebRequest) webRequest).getResponse();
		if (response != null && response.isCommitted()) {
			return null;
		}
		// Spring が付けたヘッダー（405 の Allow など）は残し、Content-Type だけ Problem Details に決める。
		HttpHeaders responseHeaders = new HttpHeaders();
		responseHeaders.putAll(headers);
		responseHeaders.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
		return ResponseEntity.status(code.status())
				.headers(responseHeaders)
				.body(ProblemDetails.build(code, errors, request.getRequestURI()));
	}

}
