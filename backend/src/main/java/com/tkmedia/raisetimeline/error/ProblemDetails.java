package com.tkmedia.raisetimeline.error;

import com.tkmedia.raisetimeline.logging.LogFields;
import java.net.URI;
import java.util.List;
import org.slf4j.MDC;
import org.springframework.http.ProblemDetail;

/**
 * {@link ProblemDetail} を組み立てる。例外ハンドラ（MVC の中）と {@link ProblemDetailWriter}（フィルタ）が
 * 同じ形の本文を返すよう、組み立てはここ 1 か所にする。
 */
public final class ProblemDetails {

	private ProblemDetails() {
	}

	public static ProblemDetail build(ErrorCode code, List<FieldError> errors, String instance) {
		// title と detail は ErrorCode の固定文言だけ。例外の文言・SQL・スタックトレースは載せない。
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(code.status(), code.message());
		problem.setTitle(code.message());
		problem.setType(URI.create("about:blank"));
		try {
			problem.setInstance(URI.create(instance));
		} catch (IllegalArgumentException e) {
			// URI として読めないパスは instance を省く。エラー応答を作る途中で、さらに失敗させないため。
		}
		problem.setProperty("code", code.name());
		if (!errors.isEmpty()) {
			problem.setProperty("errors", errors);
		}
		String requestId = MDC.get(LogFields.HTTP_REQUEST_ID);
		if (requestId != null) {
			problem.setProperty("requestId", requestId);
		}
		return problem;
	}

}
