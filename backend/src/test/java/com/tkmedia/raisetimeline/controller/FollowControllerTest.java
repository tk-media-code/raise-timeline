package com.tkmedia.raisetimeline.controller;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.service.FollowService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(controllers = FollowController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class FollowControllerTest {

	// jwtDecoder が存在確認に使う。
	@MockitoBean
	private UserMapper userMapper;

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000c1");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private FollowService followService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

	@Test
	@DisplayName("PUT は 204 で、follow(sub, alice) を呼ぶ")
	void putReturns204() throws Exception {
		mockMvc.perform(put("/api/users/{username}/follow", "alice").with(me()))
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));

		verify(followService).follow(USER_ID, "alice");
	}

	@Test
	@DisplayName("DELETE は 204 で、unfollow(sub, alice) を呼ぶ")
	void deleteReturns204() throws Exception {
		mockMvc.perform(delete("/api/users/{username}/follow", "alice").with(me()))
				.andExpect(status().isNoContent());

		verify(followService).unfollow(USER_ID, "alice");
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "followers", "following" })
	@DisplayName("GET は 200 で、items と nextCursor を返す")
	void getReturnsCards(String kind) throws Exception {
		UUID userId = UUID.fromString("0199b000-0000-7000-8000-000000000002");
		PageResponse<UserCard> page = new PageResponse<>(
				List.of(new UserCard(userId, "hanako", "花子", "https://images.test/a.png", "よろしく", true)), CURSOR);
		if (kind.equals("followers")) {
			when(followService.followers(USER_ID, "alice", CURSOR, 5)).thenReturn(page);
		}
		else {
			when(followService.following(USER_ID, "alice", CURSOR, 5)).thenReturn(page);
		}

		mockMvc.perform(get("/api/users/{username}/" + kind, "alice").param("cursor", CURSOR.toString())
				.param("limit", "5").with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].id").value(userId.toString()))
				.andExpect(jsonPath("$.items[0].username").value("hanako"))
				.andExpect(jsonPath("$.items[0].displayName").value("花子"))
				.andExpect(jsonPath("$.items[0].avatarUrl").value("https://images.test/a.png"))
				.andExpect(jsonPath("$.items[0].bio").value("よろしく"))
				.andExpect(jsonPath("$.items[0].isFollowing").value(true))
				.andExpect(jsonPath("$.nextCursor").value(CURSOR.toString()));
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "followers", "following" })
	@DisplayName("GET は limit を省くと 20 で、トークンの利用者を viewer として呼ぶ")
	void getDefaultsLimitTo20(String kind) throws Exception {
		when(followService.followers(USER_ID, "alice", null, 20)).thenReturn(new PageResponse<>(List.of(), null));
		when(followService.following(USER_ID, "alice", null, 20)).thenReturn(new PageResponse<>(List.of(), null));

		mockMvc.perform(get("/api/users/{username}/" + kind, "alice").with(me()))
				.andExpect(status().isOk());

		if (kind.equals("followers")) {
			verify(followService).followers(USER_ID, "alice", null, 20);
		}
		else {
			verify(followService).following(USER_ID, "alice", null, 20);
		}
	}

	@ParameterizedTest(name = "{0} limit={1}")
	@CsvSource({ "followers,0", "followers,51", "following,0", "following,51" })
	@DisplayName("GET は limit が範囲外なら 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidLimitReturns400(String kind, String limit) throws Exception {
		mockMvc.perform(get("/api/users/{username}/" + kind, "alice").param("limit", limit).with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(followService);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "followers", "following" })
	@DisplayName("GET は cursor が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidCursorReturns400(String kind) throws Exception {
		mockMvc.perform(get("/api/users/{username}/" + kind, "alice").param("cursor", "abc").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(followService);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "PUT", "DELETE", "GET followers", "GET following" })
	@DisplayName("Bearer が無ければ 401 UNAUTHENTICATED になり、サービスは呼ばれない")
	void requestsWithoutBearerReturn401(String method) throws Exception {
		RequestBuilder request = switch (method) {
			case "PUT" -> put("/api/users/{username}/follow", "alice");
			case "DELETE" -> delete("/api/users/{username}/follow", "alice");
			case "GET followers" -> get("/api/users/{username}/followers", "alice");
			case "GET following" -> get("/api/users/{username}/following", "alice");
			default -> throw new IllegalArgumentException(method);
		};

		mockMvc.perform(request)
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verifyNoInteractions(followService);
	}

	@Test
	@DisplayName("サービスの NotFoundException は 404 NOT_FOUND の Problem Details になる")
	void notFoundReturns404() throws Exception {
		doThrow(new NotFoundException()).when(followService).unfollow(USER_ID, "ghost");

		mockMvc.perform(delete("/api/users/{username}/follow", "ghost").with(me()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	@DisplayName("サービスの ValidationException は 422 VALIDATION_ERROR で、errors[0].field が username")
	void validationErrorReturns422() throws Exception {
		doThrow(new ValidationException(List.of(new FieldError("username", "自分自身はフォローできません"))))
				.when(followService).follow(USER_ID, "me");

		mockMvc.perform(put("/api/users/{username}/follow", "me").with(me()))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("username"))
				.andExpect(jsonPath("$.errors[0].message").value("自分自身はフォローできません"));
	}

	@Test
	@DisplayName("サービスの UnauthenticatedException は 401 UNAUTHENTICATED になる")
	void unauthenticatedReturns401() throws Exception {
		doThrow(new UnauthenticatedException()).when(followService).follow(USER_ID, "alice");

		mockMvc.perform(put("/api/users/{username}/follow", "alice").with(me()))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

}
