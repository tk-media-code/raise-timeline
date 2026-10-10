package com.tkmedia.raisetimeline.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.logging.LogLines;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(controllers = SecurityErrorTest.TestController.class)
@Import({ SecurityErrorTest.TestController.class, SecurityConfig.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@ExtendWith(OutputCaptureExtension.class)
class SecurityErrorTest {

	// jwtDecoder が存在確認に使う。本物のトークンを送るテストは existsById を true にスタブする。
	@MockitoBean
	private UserMapper userMapper;

	private static final String PROBLEM_JSON = "application/problem+json";
	private static final String USER_ID = "0199b000-0000-7000-8000-000000000001";

	@Autowired
	private MockMvc mockMvc;

	@Test
	@DisplayName("認証なしの要求は 401 の Problem Details になり、要求ログに UNAUTHENTICATED が載る。WARN と ERROR は出ない")
	void unauthenticatedReturns401Problem(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/ok"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.title").value("ログインが必要です"))
				.andReturn();

		String requestId = result.getResponse().getHeader("X-Request-Id");
		assertThat(requestId).isNotNull();
		assertThat(result.getResponse().getContentAsString()).contains("\"requestId\":\"" + requestId + "\"");
		List<Map<String, Object>> lines = requestLines(output, requestId);
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "event.code")).isEqualTo("UNAUTHENTICATED");
		assertThat(number(LogLines.get(lines.get(0), "http.response.status_code"))).isEqualTo(401L);
		assertThat(LogLines.parse(output)).noneSatisfy(line -> assertThat(LogLines.get(line, "log.level"))
				.isIn("WARN", "ERROR"));
	}

	@Test
	@DisplayName("認証済みの要求の行には、途中の行にも要求ログにも user.id が付き、要求が終わると MDC は空になる")
	void authenticatedLinesCarryUserId(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/t/ok").with(jwt().jwt(j -> j.subject(USER_ID))))
				.andExpect(status().isOk())
				.andReturn();

		String requestId = result.getResponse().getHeader("X-Request-Id");
		List<Map<String, Object>> middle = LogLines.parse(output).stream()
				.filter(line -> "処理の途中の行".equals(LogLines.get(line, "message")))
				.filter(line -> requestId.equals(LogLines.get(line, "http.request.id")))
				.toList();
		assertThat(middle).hasSize(1);
		assertThat(LogLines.get(middle.get(0), "user.id")).isEqualTo(USER_ID);
		List<Map<String, Object>> lines = requestLines(output, requestId);
		assertThat(lines).hasSize(1);
		assertThat(LogLines.get(lines.get(0), "user.id")).isEqualTo(USER_ID);
		Map<String, String> remaining = MDC.getCopyOfContextMap();
		assertThat(remaining == null || remaining.isEmpty()).isTrue();
	}

	@Test
	@DisplayName("ConflictException は 409 で、errors に項目名と固定の文言が入る")
	void conflictCarriesFieldError() throws Exception {
		mockMvc.perform(get("/api/t/conflict").with(jwt()))
				.andExpect(status().isConflict())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("USERNAME_TAKEN"))
				.andExpect(jsonPath("$.errors[0].field").value("username"))
				.andExpect(jsonPath("$.errors[0].message").value("このユーザー名は使われています"));
	}

	@Test
	@DisplayName("Spring Security のファイアウォールが拒否する URL は、400 の Problem Details になり、要求ログも 400 になる")
	void rejectedUrlReturns400Problem(CapturedOutput output) throws Exception {
		MvcResult result = mockMvc.perform(get("/api/health;x=1"))
				.andExpect(status().isBadRequest())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"))
				.andReturn();

		String requestId = result.getResponse().getHeader("X-Request-Id");
		List<Map<String, Object>> lines = requestLines(output, requestId);
		assertThat(lines).hasSize(1);
		assertThat(number(LogLines.get(lines.get(0), "http.response.status_code"))).isEqualTo(400L);
	}

	@Test
	@DisplayName("denyAll に当たった認証済みの要求は ERROR を出さずに 403、未ログインなら 401 になる")
	void deniedPathReturns403WithoutError(CapturedOutput output) throws Exception {
		MvcResult denied = mockMvc.perform(get("/x").with(jwt()))
				.andExpect(status().isForbidden())
				.andExpect(header().string("Content-Type", startsWith(PROBLEM_JSON)))
				.andExpect(jsonPath("$.code").value("FORBIDDEN"))
				.andReturn();
		mockMvc.perform(get("/x"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		assertThat(requestLines(output, denied.getResponse().getHeader("X-Request-Id")))
				.singleElement()
				.satisfies(line -> assertThat(LogLines.get(line, "event.code")).isEqualTo("FORBIDDEN"));
		assertThat(LogLines.parse(output)).noneSatisfy(line -> assertThat(LogLines.get(line, "log.level"))
				.isEqualTo("ERROR"));
	}

	private static List<Map<String, Object>> requestLines(CapturedOutput output, String requestId) {
		return LogLines.withAction(LogLines.parse(output), "http.request").stream()
				.filter(line -> requestId.equals(LogLines.get(line, "http.request.id")))
				.toList();
	}

	private static long number(Object value) {
		return ((Number) value).longValue();
	}

	@RestController
	static class TestController {

		private static final Logger log = LoggerFactory.getLogger(TestController.class);

		@GetMapping("/api/t/ok")
		void ok() {
			log.info("処理の途中の行");
		}

		@GetMapping("/api/t/conflict")
		void conflict() {
			throw new ConflictException(ErrorCode.USERNAME_TAKEN, "username");
		}

	}

}
