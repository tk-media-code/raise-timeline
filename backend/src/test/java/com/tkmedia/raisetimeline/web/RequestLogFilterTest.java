package com.tkmedia.raisetimeline.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.controller.HealthCheckController;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.logging.LogLines;
import com.tkmedia.raisetimeline.mapper.HealthCheckMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(controllers = { RequestLogFilterTest.TestController.class, HealthCheckController.class })
@Import({ RequestLogFilterTest.TestController.class, LoggingConfig.class, ProblemDetailWriter.class,
		SecurityConfig.class })
@ExtendWith(OutputCaptureExtension.class)
class RequestLogFilterTest {

	// jwtDecoder が存在確認に使う。本物のトークンを送るテストは existsById を true にスタブする。
	@MockitoBean
	private UserMapper userMapper;

	private static final Instant T0 = Instant.parse("2026-10-07T00:00:00Z");
	private static final String HEX_32 = "^[0-9a-f]{32}$";

	@Autowired
	private MockMvc mockMvc;

	// 所要時間を固定するため、時計は差し替える。ClockConfig は読み込まない。
	@MockitoBean
	private Clock clock;

	@MockitoBean
	private HealthCheckMapper healthCheckMapper;

	@BeforeEach
	void fixClock() {
		when(clock.instant()).thenReturn(T0);
	}

	@Test
	@DisplayName("要求ログの行に、メソッド・パス・クエリ・status・所要時間・requestId・client.ip が揃う")
	void requestLineHasAllFields(CapturedOutput output) throws Exception {
		mockMvc.perform(get("/api/t/ok?limit=20").header("X-Request-Id", "abc-123").with(jwt()))
				.andExpect(status().isOk())
				.andExpect(header().string("X-Request-Id", "abc-123"));

		List<Map<String, Object>> lines = requestLines(output, "abc-123");
		assertThat(lines).hasSize(1);
		Map<String, Object> line = lines.get(0);
		assertThat(LogLines.get(line, "log.level")).isEqualTo("INFO");
		assertThat(LogLines.get(line, "message")).isEqualTo("要求を処理した");
		assertThat(LogLines.get(line, "http.request.method")).isEqualTo("GET");
		assertThat(LogLines.get(line, "url.path")).isEqualTo("/api/t/ok");
		assertThat(LogLines.get(line, "url.query")).isEqualTo("limit=20");
		assertThat(number(LogLines.get(line, "http.response.status_code"))).isEqualTo(200L);
		assertThat(number(LogLines.get(line, "event.duration"))).isEqualTo(0L);
		assertThat(LogLines.get(line, "http.request.id")).isEqualTo("abc-123");
		assertThat(LogLines.get(line, "client.ip")).isEqualTo("127.0.0.1");
		assertThat(LogLines.get(line, "event.code")).isNull();
	}

	@Test
	@DisplayName("クエリが無い要求では、要求ログに url.query を出さない")
	void queryIsOmittedWhenAbsent(CapturedOutput output) throws Exception {
		mockMvc.perform(get("/api/t/ok").header("X-Request-Id", "no-query-1").with(jwt()))
				.andExpect(status().isOk());

		List<Map<String, Object>> lines = requestLines(output, "no-query-1");
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "url.query")).isNull();
	}

	@Test
	@DisplayName("GET /api/health の 200 は、要求ログが無いか DEBUG のどちらかで、INFO 以上では出ない")
	void healthCheckOkIsNotLoggedAtInfo(CapturedOutput output) throws Exception {
		when(healthCheckMapper.ping()).thenReturn(1);

		mockMvc.perform(get("/api/health").header("X-Request-Id", "health-ok-1"))
				.andExpect(status().isOk());

		// アプリの水準が DEBUG でも INFO でも通るよう、行が無いか、あっても DEBUG であることを確かめる。
		List<Map<String, Object>> lines = requestLines(output, "health-ok-1");
		assertThat(lines).allSatisfy(line -> assertThat(LogLines.get(line, "log.level")).isEqualTo("DEBUG"));
	}

	@Test
	@DisplayName("ヘルスチェックが 503 のときは、要求ログを INFO で 1 行出す")
	void healthCheckFailureIsLogged(CapturedOutput output) throws Exception {
		when(healthCheckMapper.ping()).thenThrow(new CannotGetJdbcConnectionException("db:5432 に接続できない"));

		mockMvc.perform(get("/api/health").header("X-Request-Id", "health-ng-1"))
				.andExpect(status().isServiceUnavailable());

		List<Map<String, Object>> lines = requestLines(output, "health-ng-1");
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "log.level")).isEqualTo("INFO");
		assertThat(number(LogLines.get(lines.get(0), "http.response.status_code"))).isEqualTo(503L);
	}

	@Test
	@DisplayName("1 秒を 1 ミリ秒でも超えた要求は WARN になり、所要時間がナノ秒で出る")
	void slowRequestIsWarn(CapturedOutput output) throws Exception {
		when(clock.instant()).thenReturn(T0, T0.plusMillis(1001));

		mockMvc.perform(get("/api/t/ok").header("X-Request-Id", "slow-1").with(jwt()))
				.andExpect(status().isOk());

		List<Map<String, Object>> lines = requestLines(output, "slow-1");
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "log.level")).isEqualTo("WARN");
		assertThat(number(LogLines.get(lines.get(0), "event.duration"))).isEqualTo(1_001_000_000L);
	}

	@Test
	@DisplayName("ちょうど 1 秒の要求は INFO のまま")
	void exactlyOneSecondIsInfo(CapturedOutput output) throws Exception {
		when(clock.instant()).thenReturn(T0, T0.plusMillis(1000));

		mockMvc.perform(get("/api/t/ok").header("X-Request-Id", "exact-1").with(jwt()))
				.andExpect(status().isOk());

		List<Map<String, Object>> lines = requestLines(output, "exact-1");
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "log.level")).isEqualTo("INFO");
		assertThat(number(LogLines.get(lines.get(0), "event.duration"))).isEqualTo(1_000_000_000L);
	}

	@Test
	@DisplayName("遅いヘルスチェックは、200 でも DEBUG に落とさず WARN にする")
	void slowHealthCheckIsStillWarn(CapturedOutput output) throws Exception {
		when(healthCheckMapper.ping()).thenReturn(1);
		when(clock.instant()).thenReturn(T0, T0.plusMillis(1500));

		mockMvc.perform(get("/api/health").header("X-Request-Id", "health-slow-1"))
				.andExpect(status().isOk());

		List<Map<String, Object>> lines = requestLines(output, "health-slow-1");
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "log.level")).isEqualTo("WARN");
	}

	@ParameterizedTest(name = "[{index}] 形式に合わない X-Request-Id は作り直す")
	@DisplayName("形式に合わない X-Request-Id は捨てて作り直し、送られた値をログにも応答にも出さない")
	@ValueSource(strings = { "../etc", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "a\"b", "" })
	void invalidRequestIdIsRegenerated(String submitted, CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/ok").header("X-Request-Id", submitted).with(jwt()))
				.andExpect(status().isOk())
				.andReturn();

		String issued = result.getResponse().getHeader("X-Request-Id");
		assertThat(issued).matches(HEX_32).isNotEqualTo(submitted);
		List<Map<String, Object>> lines = requestLines(output, issued);
		assertThat(lines).hasSize(1);
		if (!submitted.isEmpty()) {
			assertThat(output.getOut()).doesNotContain(submitted);
		}
	}

	@Test
	@DisplayName("64 文字ちょうどの X-Request-Id はそのまま受け入れ、応答にも要求ログにも同じ値を出す")
	void maxLengthRequestIdIsAccepted(CapturedOutput output) throws Exception {
		String submitted = "a".repeat(64);

		MvcResult result = mockMvc.perform(get("/api/t/ok").header("X-Request-Id", submitted).with(jwt()))
				.andExpect(status().isOk())
				.andReturn();

		assertThat(result.getResponse().getHeader("X-Request-Id")).isEqualTo(submitted);
		List<Map<String, Object>> lines = requestLines(output, submitted);
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "http.request.id")).isEqualTo(submitted);
	}

	@Test
	@DisplayName("X-Request-Id が無ければ 32 文字の小文字 16 進を作り、要求ごとに別の値になる")
	void missingRequestIdIsGenerated(CapturedOutput output) throws Exception {
		String first = mockMvc.perform(get("/api/t/ok").with(jwt())).andReturn().getResponse().getHeader("X-Request-Id");
		String second = mockMvc.perform(get("/api/t/ok").with(jwt())).andReturn().getResponse().getHeader("X-Request-Id");

		assertThat(first).matches(HEX_32);
		assertThat(second).matches(HEX_32).isNotEqualTo(first);
		assertThat(requestLines(output, first)).hasSize(1);
	}

	@Test
	@DisplayName("要求の途中で書いた行にも、requestId と client.ip が付く")
	void linesDuringRequestCarryRequestIdAndClientIp(CapturedOutput output) throws Exception {
		String id = mockMvc.perform(get("/api/t/log").with(jwt())).andExpect(status().isOk())
				.andReturn().getResponse().getHeader("X-Request-Id");

		List<Map<String, Object>> middle = LogLines.parse(output).stream()
				.filter(line -> "処理の途中の行".equals(LogLines.get(line, "message")))
				.filter(line -> id.equals(LogLines.get(line, "http.request.id")))
				.toList();
		assertThat(middle).hasSize(1);
		assertThat(LogLines.get(middle.get(0), "client.ip")).isEqualTo("127.0.0.1");
	}

	@Test
	@DisplayName("MDC に置いた user.id は要求ログに載り、要求が終わると MDC は空になって次の要求に残らない")
	void mdcValuesReachRequestLineAndAreCleared(CapturedOutput output) throws Exception {
		String first = mockMvc.perform(get("/api/t/mdc").with(jwt())).andExpect(status().isOk())
				.andReturn().getResponse().getHeader("X-Request-Id");

		List<Map<String, Object>> firstLines = requestLines(output, first);
		assertThat(firstLines).hasSize(1);
		assertThat(LogLines.get(firstLines.get(0), "user.id")).isEqualTo("u-1");
		Map<String, String> remaining = MDC.getCopyOfContextMap();
		assertThat(remaining == null || remaining.isEmpty()).isTrue();

		String second = mockMvc.perform(get("/api/t/ok").with(jwt())).andExpect(status().isOk())
				.andReturn().getResponse().getHeader("X-Request-Id");

		List<Map<String, Object>> secondLines = requestLines(output, second);
		assertThat(secondLines).hasSize(1);
		// jwt() の subject は UserIdLogFilter が user.id に置く。1 回目の u-1 が残っていないことを確かめる。
		assertThat(LogLines.get(secondLines.get(0), "user.id")).isNotEqualTo("u-1");
	}

	@Test
	@DisplayName("フィルタで ClientAbortException が起きても、ERROR も応答本文も出さず、要求ログは code 無しで 1 行だけ出る")
	void clientAbortInFilterIsNotError(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/filter-disconnect").header("X-Request-Id", "filter-abort-1"))
				.andReturn();

		assertThat(result.getResponse().getContentAsString()).isEmpty();
		assertThat(LogLines.parse(output)).noneSatisfy(line -> assertThat(LogLines.get(line, "log.level"))
				.isEqualTo("ERROR"));
		List<Map<String, Object>> lines = requestLines(output, "filter-abort-1");
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "event.code")).isNull();
	}

	@Test
	@DisplayName("フィルタで起きた IOException は、文言が Broken pipe でも切断とは見なさず、500 と ERROR 1 行にする")
	void serverSideIoExceptionInFilterIsError(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/filter-io").header("X-Request-Id", "filter-io-1"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andReturn();

		assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
		List<Map<String, Object>> errors = LogLines.parse(output).stream()
				.filter(line -> "ERROR".equals(LogLines.get(line, "log.level")))
				.filter(line -> "filter-io-1".equals(LogLines.get(line, "http.request.id")))
				.toList();
		assertThat(errors).hasSize(1);
	}

	/** 指定した requestId の要求ログ。他のテストの行や起動時の行に左右されないよう、requestId で絞る。 */
	private static List<Map<String, Object>> requestLines(CapturedOutput output, String requestId) {
		return LogLines.withAction(LogLines.parse(output), "http.request").stream()
				.filter(line -> requestId.equals(LogLines.get(line, "http.request.id")))
				.toList();
	}

	private static long number(Object value) {
		return ((Number) value).longValue();
	}

	@TestConfiguration
	static class FilterFailureConfig {

		/** RequestLogFilter の内側で、MVC の手前の失敗を再現するフィルタ。自分のパスにだけ効く。 */
		@Bean
		FilterRegistrationBean<Filter> filterFailure() {
			FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>(
					new Filter() {
						@Override
						public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
								throws IOException, ServletException {
							if ("/api/t/filter-disconnect".equals(((HttpServletRequest) request).getRequestURI())) {
								throw new ServletException(new ClientAbortException(new IOException("Broken pipe")));
							}
							throw new IOException("Broken pipe");
						}
					});
			registration.setOrder(RequestLogFilter.ORDER + 1);
			registration.addUrlPatterns("/api/t/filter-disconnect", "/api/t/filter-io");
			return registration;
		}

	}

	@RestController
	static class TestController {

		private static final Logger log = LoggerFactory.getLogger(TestController.class);

		@GetMapping("/api/t/ok")
		void ok() {
		}

		@GetMapping("/api/t/log")
		void logged() {
			log.info("処理の途中の行");
		}

		@GetMapping("/api/t/mdc")
		void mdc() {
			MDC.put("user.id", "u-1");
		}

	}

}
