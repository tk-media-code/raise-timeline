package com.tkmedia.raisetimeline.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.logging.LogLines;
import com.tkmedia.raisetimeline.mapper.HealthCheckMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HealthCheckController.class)
@Import({ SecurityConfig.class, ClockConfig.class, ProblemDetailWriter.class })
@ExtendWith(OutputCaptureExtension.class)
class HealthCheckControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private HealthCheckMapper healthCheckMapper;

	@Test
	@DisplayName("DB へ問い合わせが通れば、GET /api/health は 200 と UP を返す")
	void returnsOkWhenDatabaseResponds() throws Exception {
		when(healthCheckMapper.ping()).thenReturn(1);

		mockMvc.perform(get("/api/health"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.database").value("UP"))
				.andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	@DisplayName("DB に届かなければ、GET /api/health は 503 と DOWN を返し、原因を本文に載せない")
	void returnsServiceUnavailableWhenDatabaseIsUnreachable(CapturedOutput output) throws Exception {
		when(healthCheckMapper.ping())
				.thenThrow(new CannotGetJdbcConnectionException("db:5432 に接続できない"));

		mockMvc.perform(get("/api/health"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.status").value("DOWN"))
				.andExpect(jsonPath("$.database").value("DOWN"))
				// キーが2つだけ＝例外の文言や接続先を本文に足していない。
				.andExpect(jsonPath("$.length()").value(2));

		// 原因はログにだけ残す。WARN の行が 1 つで、出来事の名前と例外の型が付く。
		List<Map<String, Object>> warnings = LogLines.parse(output).stream()
				.filter(line -> "WARN".equals(LogLines.get(line, "log.level")))
				.toList();
		assertThat(warnings).hasSize(1);
		assertThat(LogLines.get(warnings.get(0), "event.action")).isEqualTo("health.db_unreachable");
		assertThat(LogLines.get(warnings.get(0), "error.type"))
				.isEqualTo("org.springframework.jdbc.CannotGetJdbcConnectionException");
	}

	@Test
	@DisplayName("問い合わせそのものが失敗しても、GET /api/health は 503 と DOWN を返す")
	void returnsServiceUnavailableWhenQueryFails() throws Exception {
		when(healthCheckMapper.ping())
				.thenThrow(new QueryTimeoutException("時間切れ"));

		mockMvc.perform(get("/api/health"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.status").value("DOWN"))
				.andExpect(jsonPath("$.database").value("DOWN"))
				.andExpect(jsonPath("$.length()").value(2));
	}

}
