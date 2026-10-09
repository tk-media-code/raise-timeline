package com.tkmedia.raisetimeline.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.service.TimelineService;
import java.util.List;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(controllers = TimelineController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class TimelineControllerTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private TimelineService timelineService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

	private static PageResponse<PostResponse> emptyPage() {
		return new PageResponse<>(List.of(), null);
	}

	@Test
	@DisplayName("Bearer が無いと 401 になり、サービスは呼ばれない")
	void requiresBearer() throws Exception {
		mockMvc.perform(get("/api/timeline/all"))
				.andExpect(status().isUnauthorized());

		verifyNoInteractions(timelineService);
	}

	@Test
	@DisplayName("クエリが無ければ、先頭から 20 件を取る")
	void defaultsToFirstPageOf20() throws Exception {
		when(timelineService.all(null, 20)).thenReturn(emptyPage());

		mockMvc.perform(get("/api/timeline/all").with(me()))
				.andExpect(status().isOk());

		verify(timelineService).all(null, 20);
	}

	@Test
	@DisplayName("limit が 50 なら受け付ける")
	void limit50IsAccepted() throws Exception {
		when(timelineService.all(null, 50)).thenReturn(emptyPage());

		mockMvc.perform(get("/api/timeline/all").param("limit", "50").with(me()))
				.andExpect(status().isOk());

		verify(timelineService).all(null, 50);
	}

	@Test
	@DisplayName("cursor はサービスにそのまま渡る")
	void cursorIsPassedThrough() throws Exception {
		UUID cursor = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
		when(timelineService.all(cursor, 20)).thenReturn(emptyPage());

		mockMvc.perform(get("/api/timeline/all").param("cursor", cursor.toString()).with(me()))
				.andExpect(status().isOk());

		verify(timelineService).all(cursor, 20);
	}

	@ParameterizedTest(name = "limit={0}")
	@ValueSource(strings = { "0", "-1", "51", "abc" })
	@DisplayName("limit が 1 未満・50 超・数でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidLimitReturns400(String limit) throws Exception {
		mockMvc.perform(get("/api/timeline/all").param("limit", limit).with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(timelineService);
	}

	@Test
	@DisplayName("cursor が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidCursorReturns400() throws Exception {
		mockMvc.perform(get("/api/timeline/all").param("cursor", "abc").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(timelineService);
	}

	@Test
	@DisplayName("続きが無いとき、nextCursor は鍵ごと省かれず null として出る")
	void nullCursorIsSerialized() throws Exception {
		when(timelineService.all(null, 20)).thenReturn(emptyPage());

		mockMvc.perform(get("/api/timeline/all").with(me()))
				.andExpect(jsonPath("$.nextCursor").hasJsonPath())
				.andExpect(jsonPath("$.nextCursor").value(Matchers.nullValue()))
				.andExpect(jsonPath("$.items").isEmpty());
	}

}
