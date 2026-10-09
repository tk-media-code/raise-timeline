package com.tkmedia.raisetimeline.controller;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.service.UserService;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = UserController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class UserControllerTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private UserService userService;

	@Test
	@DisplayName("Bearer が無いと 401 になり、サービスは呼ばれない")
	void meRequiresBearer() throws Exception {
		mockMvc.perform(get("/api/users/me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

	@Test
	@DisplayName("Bearer の sub の利用者の情報を 200 で返す。フォロー数は暫定の 0")
	void meReturnsMe() throws Exception {
		when(userService.getMe(USER_ID)).thenReturn(new Me(USER_ID, "taro_1", "太郎", null, "", false, 0, 0,
				OffsetDateTime.parse("2026-10-01T00:00:00Z"), true, "taro@example.com"));

		mockMvc.perform(get("/api/users/me").with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(USER_ID.toString()))
				.andExpect(jsonPath("$.email").value("taro@example.com"))
				.andExpect(jsonPath("$.isMe").value(true))
				.andExpect(jsonPath("$.followersCount").value(0));
	}

	@Test
	@DisplayName("利用者がいなければ 404 の Problem Details になる")
	void meOfMissingUserReturns404() throws Exception {
		when(userService.getMe(USER_ID)).thenThrow(new NotFoundException());

		mockMvc.perform(get("/api/users/me").with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

}
