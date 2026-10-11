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
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.service.UserSearchService;
import java.util.List;
import java.util.UUID;
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

@WebMvcTest(controllers = UserSearchController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class UserSearchControllerTest {

	// jwtDecoder が存在確認に使う。
	@MockitoBean
	private UserMapper userMapper;

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000c1");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private UserSearchService userSearchService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

	@Test
	@DisplayName("トークンの利用者を viewer として、q・cursor・limit を渡し、items と nextCursor を返す")
	void passesViewerAndParameters() throws Exception {
		UUID userId = UUID.fromString("0199b000-0000-7000-8000-000000000002");
		when(userSearchService.search(USER_ID, "ali", CURSOR, 5)).thenReturn(new PageResponse<>(
				List.of(new UserCard(userId, "alice", "アリス", "https://images.test/a.png", "よろしく", true)), CURSOR));

		mockMvc.perform(get("/api/users").param("q", "ali").param("cursor", CURSOR.toString())
				.param("limit", "5").with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].id").value(userId.toString()))
				.andExpect(jsonPath("$.items[0].username").value("alice"))
				.andExpect(jsonPath("$.items[0].isFollowing").value(true))
				.andExpect(jsonPath("$.nextCursor").value(CURSOR.toString()));

		verify(userSearchService).search(USER_ID, "ali", CURSOR, 5);
	}

	@Test
	@DisplayName("q が無いと、サービスに null を渡す（400 にしない）。limit を省くと 20")
	void missingQueryIsPassedAsNull() throws Exception {
		when(userSearchService.search(USER_ID, null, null, 20)).thenReturn(new PageResponse<>(List.of(), null));

		mockMvc.perform(get("/api/users").with(me()))
				.andExpect(status().isOk());

		verify(userSearchService).search(USER_ID, null, null, 20);
	}

	@Test
	@DisplayName("サービスが投げた ValidationException は 422 VALIDATION_ERROR で、errors に q の文言が入る")
	void validationErrorReturns422() throws Exception {
		when(userSearchService.search(USER_ID, " ", null, 20))
				.thenThrow(new ValidationException(List.of(new FieldError("q", "検索する語を入力してください"))));

		mockMvc.perform(get("/api/users").param("q", " ").with(me()))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("q"))
				.andExpect(jsonPath("$.errors[0].message").value("検索する語を入力してください"));
	}

	@ParameterizedTest(name = "limit={0}")
	@ValueSource(strings = { "0", "51" })
	@DisplayName("limit が範囲外なら 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidLimitReturns400(String limit) throws Exception {
		mockMvc.perform(get("/api/users").param("q", "ali").param("limit", limit).with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(userSearchService);
	}

	@Test
	@DisplayName("cursor が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidCursorReturns400() throws Exception {
		mockMvc.perform(get("/api/users").param("q", "ali").param("cursor", "abc").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(userSearchService);
	}

	@Test
	@DisplayName("Bearer が無ければ 401 UNAUTHENTICATED になり、サービスは呼ばれない")
	void requestWithoutBearerReturns401() throws Exception {
		mockMvc.perform(get("/api/users").param("q", "ali"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verifyNoInteractions(userSearchService);
	}

}
