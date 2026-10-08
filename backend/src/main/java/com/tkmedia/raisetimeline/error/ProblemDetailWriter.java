package com.tkmedia.raisetimeline.error;

import com.tkmedia.raisetimeline.web.RequestLogFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * MVC の外（フィルタ）でエラー応答を書く。例外ハンドラは MVC の中でしか働かないので、
 * フィルタから漏れた例外や、将来の Spring Security の 401・403 はこちらで書く。
 *
 * <p>JSON は Spring が管理する {@link JsonMapper} で作る。MVC の応答を作る変換器と同じ設定なので、
 * {@code code} や {@code requestId} が最上位に出る形が両方の経路でそろう。自前の JSON 組み立てはしない。
 */
@Component
public class ProblemDetailWriter {

	private final JsonMapper mapper;

	public ProblemDetailWriter(JsonMapper mapper) {
		this.mapper = mapper;
	}

	public void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code) throws IOException {
		// 要求ログが読む code は、応答が確定済みでも置く。
		RequestLogFilter.setErrorCode(request, code.name());
		if (response.isCommitted()) {
			// 書き始めた応答は直せない。本文を足すと壊れた応答になるので、何も書かない。
			return;
		}
		// 本文だけ捨てる。X-Request-Id のようなヘッダーは残す。
		response.resetBuffer();
		response.setStatus(code.status().value());
		response.setContentType("application/problem+json;charset=UTF-8");
		String json = mapper.writeValueAsString(ProblemDetails.build(code, List.of(), request.getRequestURI()));
		response.getOutputStream().write(json.getBytes(StandardCharsets.UTF_8));
	}

}
