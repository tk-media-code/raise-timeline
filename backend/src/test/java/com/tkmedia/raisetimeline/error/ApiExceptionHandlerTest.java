package com.tkmedia.raisetimeline.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.logging.LogLines;
import com.tkmedia.raisetimeline.web.RequestLogFilter;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.io.EOFException;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(controllers = ApiExceptionHandlerTest.ThrowingController.class)
@Import({ ApiExceptionHandlerTest.ThrowingController.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@ExtendWith(OutputCaptureExtension.class)
class ApiExceptionHandlerTest {

	private static final String PROBLEM_JSON = "application/problem+json";
	private static final String INTERNAL_DETAIL = "問題が起きました。時間をおいて再試行してください";

	@Autowired
	private MockMvc mockMvc;

	@Test
	@DisplayName("業務の例外は RFC 9457 の形（type・title・detail・status・instance・code・requestId）で返り、要求ログに code が載る")
	void apiExceptionHasProblemShape(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/not-found").header("X-Request-Id", "problem-1"))
				.andExpect(status().isNotFound())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.type").value("about:blank"))
				.andExpect(jsonPath("$.title").value("見つかりません"))
				.andExpect(jsonPath("$.detail").value("見つかりません"))
				.andExpect(jsonPath("$.status").value(404))
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.instance").value("/api/t/not-found"))
				.andExpect(jsonPath("$.requestId").value("problem-1"))
				.andExpect(jsonPath("$.errors").doesNotExist())
				.andExpect(jsonPath("$.properties").doesNotExist())
				.andReturn();

		assertThat(result.getResponse().getHeader("X-Request-Id")).isEqualTo("problem-1");
		Map<String, Object> requestLine = onlyRequestLine(output, "problem-1");
		assertThat(LogLines.get(requestLine, "event.code")).isEqualTo("NOT_FOUND");
		assertThat(number(LogLines.get(requestLine, "http.response.status_code"))).isEqualTo(404L);
		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("業務の例外が持つ項目ごとの誤りは errors に入る")
	void apiExceptionCarriesFieldErrors() throws Exception {
		mockMvc.perform(get("/api/t/invalid"))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("body"))
				.andExpect(jsonPath("$.errors[0].message").value("280 文字以内で入力してください"));
	}

	@Test
	@DisplayName("Bean Validation の失敗は 422 の VALIDATION_ERROR になり、errors に項目名が入る")
	void beanValidationReturns422() throws Exception {
		mockMvc.perform(post("/api/t/validation").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("name"));
	}

	@Test
	@DisplayName("壊れた JSON は 400 の BAD_REQUEST になり、WARN も ERROR も書かない")
	void malformedJsonReturns400(CapturedOutput output) throws Exception {
		mockMvc.perform(post("/api/t/validation").contentType(MediaType.APPLICATION_JSON).content("{"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"))
				.andExpect(jsonPath("$.detail").value("要求の形式が正しくありません"));

		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("存在しない URL（ルートを含む）は 404 の NOT_FOUND になり、WARN も ERROR も書かない")
	void rootIsNotFoundAfterMove(CapturedOutput output) throws Exception {
		mockMvc.perform(get("/"))
				.andExpect(status().isNotFound())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));

		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("メソッド違いは 405 で、Spring が付けた Allow ヘッダーを残し、WARN も ERROR も書かない")
	void wrongMethodReturns405WithAllowAndNoWarn(CapturedOutput output) throws Exception {
		mockMvc.perform(delete("/api/t/not-found"))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
				.andExpect(header().string("Allow", containsString("GET")));

		assertNoWarnOrError(output);
	}

	@Test
	@DisplayName("JSON の API に JSON 以外の Content-Type で送ると 415 の UNSUPPORTED_MEDIA_TYPE になる")
	void nonJsonContentTypeReturns415() throws Exception {
		mockMvc.perform(post("/api/t/validation").contentType(MediaType.TEXT_PLAIN).content("x"))
				.andExpect(status().isUnsupportedMediaType())
				.andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
	}

	@Test
	@DisplayName("想定外の例外は 500 で固定文言だけを返し、例外の中身は本文に出さず、ERROR を 1 回だけ書く")
	void unexpectedExceptionIsLoggedOnceAndHidden(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/boom").header("X-Request-Id", "boom-1"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andExpect(jsonPath("$.detail").value(INTERNAL_DETAIL))
				.andReturn();

		assertThat(result.getResponse().getContentAsString()).doesNotContain("secret-detail");
		List<Map<String, Object>> errors = errorLines(output);
		assertThat(errors).hasSize(1);
		Map<String, Object> error = errors.get(0);
		assertThat(LogLines.get(error, "event.action")).isEqualTo("http.request.failed");
		assertThat(LogLines.get(error, "event.code")).isEqualTo("INTERNAL_ERROR");
		assertThat(LogLines.get(error, "error.type")).isEqualTo("java.lang.IllegalStateException");
		assertThat((String) LogLines.get(error, "error.stack_trace")).contains("secret-detail");
		assertThat(LogLines.get(error, "http.request.id")).isEqualTo(result.getResponse().getHeader("X-Request-Id"));
		Map<String, Object> requestLine = onlyRequestLine(output, "boom-1");
		assertThat(number(LogLines.get(requestLine, "http.response.status_code"))).isEqualTo(500L);
		assertThat(LogLines.get(requestLine, "event.code")).isEqualTo("INTERNAL_ERROR");
	}

	@Test
	@DisplayName("フィルタから漏れた例外も 500 の Problem Details になり、code と requestId は最上位に出て、ERROR は 1 回だけ")
	void exceptionInFilterBecomesProblem500(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/filter-boom").header("X-Request-Id", "filter-boom-1"))
				.andExpect(status().isInternalServerError())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andExpect(jsonPath("$.detail").value(INTERNAL_DETAIL))
				.andExpect(jsonPath("$.requestId").value("filter-boom-1"))
				.andExpect(jsonPath("$.properties").doesNotExist())
				.andExpect(content().string(not(containsString("filter-secret"))))
				.andReturn();

		assertThat(result.getResponse().getHeader("X-Request-Id")).isEqualTo("filter-boom-1");
		List<Map<String, Object>> errors = errorLines(output);
		assertThat(errors).hasSize(1);
		assertThat(LogLines.get(errors.get(0), "event.action")).isEqualTo("http.request.failed");
		assertThat(LogLines.get(errors.get(0), "error.type")).isEqualTo("java.lang.RuntimeException");
		Map<String, Object> requestLine = onlyRequestLine(output, "filter-boom-1");
		assertThat(number(LogLines.get(requestLine, "http.response.status_code"))).isEqualTo(500L);
		assertThat(LogLines.get(requestLine, "event.code")).isEqualTo("INTERNAL_ERROR");
	}

	@Test
	@DisplayName("確定済みの応答には本文を足さず、ERROR は 1 回だけ書き、要求ログに code を残す")
	void committedResponseIsNotRewrittenAndErrorIsLoggedOnce(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/committed-boom").header("X-Request-Id", "committed-1"))
				.andExpect(status().isOk())
				.andReturn();

		String body = result.getResponse().getContentAsString();
		assertThat(body).isEqualTo("partial").doesNotContain("code").doesNotContain("after-commit-secret");
		List<Map<String, Object>> errors = errorLines(output);
		assertThat(errors).hasSize(1);
		assertThat(LogLines.get(errors.get(0), "event.action")).isEqualTo("http.request.failed");
		assertThat(LogLines.get(errors.get(0), "event.code")).isEqualTo("INTERNAL_ERROR");
		Map<String, Object> requestLine = onlyRequestLine(output, "committed-1");
		assertThat(LogLines.get(requestLine, "event.code")).isEqualTo("INTERNAL_ERROR");
	}

	@Test
	@DisplayName("クライアントが切断した例外は、こちらの失敗ではないので WARN にも ERROR にもしない")
	void clientDisconnectIsNotLoggedAsError(CapturedOutput output) throws Exception {
		mockMvc.perform(get("/api/t/disconnect").header("X-Request-Id", "disconnect-1"));

		assertNoWarnOrError(output);
		Map<String, Object> requestLine = onlyRequestLine(output, "disconnect-1");
		assertThat(LogLines.get(requestLine, "event.code")).isNull();
	}

	@Test
	@DisplayName("型が合わない入力（束縛の失敗）の errors には、例外の文言ではなく固定の文を返す")
	void bindingFailureMessageIsFixedText() throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/bind?limit=abc"))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("limit"))
				.andExpect(jsonPath("$.errors[0].message").value("入力の形式が正しくありません"))
				.andReturn();

		assertThat(result.getResponse().getContentAsString())
				.doesNotContain("Failed to convert")
				.doesNotContain("java.lang");
	}

	@Test
	@DisplayName("サーバー側の失敗の原因が Broken pipe でも、切断とは見なさず 500 と ERROR にする")
	void serverSideBrokenPipeIsStillAnError(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/broken-pipe").header("X-Request-Id", "serverSideBrokenPipeIsStillAnError-1"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andReturn();

		assertThat(result.getResponse().getContentAsString()).doesNotContain("db-secret");
		List<Map<String, Object>> errors = errorLines(output);
		assertThat(errors).hasSize(1);
		assertThat(LogLines.get(errors.get(0), "event.action")).isEqualTo("http.request.failed");
		Map<String, Object> requestLine = onlyRequestLine(output, "serverSideBrokenPipeIsStillAnError-1");
		assertThat(LogLines.get(requestLine, "event.code")).isEqualTo("INTERNAL_ERROR");
	}

	@Test
	@DisplayName("サーバー側の失敗の原因が EOFException でも、切断とは見なさず 500 と ERROR にする")
	void serverSideEofIsStillAnError(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/eof").header("X-Request-Id", "serverSideEofIsStillAnError-1"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andReturn();

		assertThat(result.getResponse().getContentAsString()).doesNotContain("eof-secret");
		List<Map<String, Object>> errors = errorLines(output);
		assertThat(errors).hasSize(1);
		assertThat(LogLines.get(errors.get(0), "event.action")).isEqualTo("http.request.failed");
		Map<String, Object> requestLine = onlyRequestLine(output, "serverSideEofIsStillAnError-1");
		assertThat(LogLines.get(requestLine, "event.code")).isEqualTo("INTERNAL_ERROR");
	}

	@Test
	@DisplayName("書き込みの失敗に包まれたクライアントの切断も、WARN にも ERROR にもしない")
	void wrappedClientAbortIsNotLoggedAsError(CapturedOutput output) throws Exception {
		mockMvc.perform(get("/api/t/wrapped-disconnect").header("X-Request-Id", "wrapped-1"));

		assertNoWarnOrError(output);
		Map<String, Object> requestLine = onlyRequestLine(output, "wrapped-1");
		assertThat(LogLines.get(requestLine, "event.code")).isNull();
	}

	private static Map<String, Object> onlyRequestLine(CapturedOutput output, String requestId) {
		List<Map<String, Object>> lines = LogLines.withAction(LogLines.parse(output), "http.request").stream()
				.filter(line -> requestId.equals(LogLines.get(line, "http.request.id")))
				.toList();
		assertThat(lines).hasSize(1);
		return lines.get(0);
	}

	private static List<Map<String, Object>> errorLines(CapturedOutput output) {
		return LogLines.parse(output).stream()
				.filter(line -> "ERROR".equals(LogLines.get(line, "log.level")))
				.toList();
	}

	/** 4xx は利用者の操作で起きるので、WARN にも ERROR にもしない（運用の通知を鳴らさないため）。 */
	private static void assertNoWarnOrError(CapturedOutput output) {
		assertThat(LogLines.parse(output)).noneSatisfy(line ->
				assertThat(LogLines.get(line, "log.level")).isIn("WARN", "ERROR"));
	}

	private static long number(Object value) {
		return ((Number) value).longValue();
	}

	/** テストの中だけで使う、NOT_FOUND を投げる例外。本物の派生は、投げる機能の Issue で足す。 */
	static class TestNotFoundException extends ApiException {

		private static final long serialVersionUID = 1L;

		TestNotFoundException() {
			super(ErrorCode.NOT_FOUND);
		}

	}

	/** テストの中だけで使う、項目ごとの誤りを持つ例外。 */
	static class TestInvalidException extends ApiException {

		private static final long serialVersionUID = 1L;

		TestInvalidException() {
			super(ErrorCode.VALIDATION_ERROR, List.of(new FieldError("body", "280 文字以内で入力してください")));
		}

	}

	record Body(@NotBlank String name) {
	}

	record Query(@Min(1) Integer limit) {
	}

	@RestController
	static class ThrowingController {

		@GetMapping("/api/t/not-found")
		void notFound() {
			throw new TestNotFoundException();
		}

		@GetMapping("/api/t/invalid")
		void invalid() {
			throw new TestInvalidException();
		}

		@PostMapping("/api/t/validation")
		void validation(@Valid @RequestBody Body body) {
		}

		@GetMapping("/api/t/committed-boom")
		void committedBoom(HttpServletResponse response) throws IOException {
			response.getWriter().write("partial");
			response.flushBuffer();
			throw new IllegalStateException("after-commit-secret");
		}

		@GetMapping("/api/t/disconnect")
		void disconnect() throws IOException {
			throw new ClientAbortException(new IOException("Broken pipe"));
		}

		@GetMapping("/api/t/broken-pipe")
		void brokenPipe() {
			throw new IllegalStateException("db-secret", new IOException("Broken pipe"));
		}

		@GetMapping("/api/t/eof")
		void eof() {
			throw new IllegalStateException("eof-secret", new EOFException());
		}

		@GetMapping("/api/t/wrapped-disconnect")
		void wrappedDisconnect() {
			throw new HttpMessageNotWritableException("write failed",
					new ClientAbortException(new IOException("Broken pipe")));
		}

		@GetMapping("/api/t/bind")
		void bind(@Valid Query query) {
		}

		@GetMapping("/api/t/boom")
		void boom() {
			throw new IllegalStateException("secret-detail-db:5432");
		}

	}

	@TestConfiguration
	static class FilterBoomConfig {

		/** RequestLogFilter の内側で例外を投げるフィルタ。MVC の手前で起きる失敗を再現する。 */
		@Bean
		FilterRegistrationBean<Filter> filterBoom() {
			FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>(
					new Filter() {
						@Override
						public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
								throws IOException, ServletException {
							throw new RuntimeException("filter-secret");
						}
					});
			registration.setOrder(RequestLogFilter.ORDER + 1);
			registration.addUrlPatterns("/api/t/filter-boom");
			return registration;
		}

	}

}
