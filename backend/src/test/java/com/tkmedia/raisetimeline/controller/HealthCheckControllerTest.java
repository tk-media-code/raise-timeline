package com.tkmedia.raisetimeline.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HealthCheckController.class)
class HealthCheckControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private JdbcTemplate jdbcTemplate;

	@Test
	@DisplayName("DB へ問い合わせが通れば、GET / は 200 と UP を返す")
	void returnsOkWhenDatabaseResponds() throws Exception {
		when(jdbcTemplate.queryForObject("SELECT 1", Integer.class)).thenReturn(1);

		mockMvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.database").value("UP"))
				.andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	@DisplayName("DB に届かなければ、GET / は 503 と DOWN を返し、原因を本文に載せない")
	void returnsServiceUnavailableWhenDatabaseIsUnreachable() throws Exception {
		when(jdbcTemplate.queryForObject("SELECT 1", Integer.class))
				.thenThrow(new CannotGetJdbcConnectionException("db:5432 に接続できない"));

		mockMvc.perform(get("/"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.status").value("DOWN"))
				.andExpect(jsonPath("$.database").value("DOWN"))
				// キーが2つだけ＝例外の文言や接続先を本文に足していない。
				.andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	@DisplayName("問い合わせそのものが失敗しても、GET / は 503 と DOWN を返す")
	void returnsServiceUnavailableWhenQueryFails() throws Exception {
		when(jdbcTemplate.queryForObject("SELECT 1", Integer.class))
				.thenThrow(new QueryTimeoutException("時間切れ"));

		mockMvc.perform(get("/"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.status").value("DOWN"))
				.andExpect(jsonPath("$.database").value("DOWN"))
				.andExpect(jsonPath("$.length()").value(2));
	}

}
