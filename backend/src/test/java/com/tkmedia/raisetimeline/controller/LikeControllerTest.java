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
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.service.LikeService;
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
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(controllers = LikeController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class LikeControllerTest {

	// jwtDecoder が存在確認に使う。
	@MockitoBean
	private UserMapper userMapper;

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000c1");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private LikeService likeService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

	@Test
	@DisplayName("PUT は 204 で、like(sub, id) を呼ぶ")
	void putReturns204() throws Exception {
		mockMvc.perform(put("/api/posts/{id}/like", POST_ID).with(me()))
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));

		verify(likeService).like(USER_ID, POST_ID);
	}

	@Test
	@DisplayName("DELETE は 204 で、unlike(sub, id) を呼ぶ")
	void deleteReturns204() throws Exception {
		mockMvc.perform(delete("/api/posts/{id}/like", POST_ID).with(me()))
				.andExpect(status().isNoContent());

		verify(likeService).unlike(USER_ID, POST_ID);
	}

	@Test
	@DisplayName("GET は 200 で、items[0] に id・username・displayName・avatarUrl・bio・isFollowing の鍵があり、nextCursor を返す")
	void getReturnsCards() throws Exception {
		UUID userId = UUID.fromString("0199b000-0000-7000-8000-000000000002");
		when(likeService.likers(POST_ID, CURSOR, 5)).thenReturn(new PageResponse<>(
				List.of(new UserCard(userId, "hanako", "花子", "https://images.test/a.png", "よろしく", false)),
				CURSOR));

		mockMvc.perform(get("/api/posts/{id}/likes", POST_ID).param("cursor", CURSOR.toString())
				.param("limit", "5").with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].id").value(userId.toString()))
				.andExpect(jsonPath("$.items[0].username").value("hanako"))
				.andExpect(jsonPath("$.items[0].displayName").value("花子"))
				.andExpect(jsonPath("$.items[0].avatarUrl").value("https://images.test/a.png"))
				.andExpect(jsonPath("$.items[0].bio").value("よろしく"))
				.andExpect(jsonPath("$.items[0].isFollowing").value(false))
				.andExpect(jsonPath("$.nextCursor").value(CURSOR.toString()));
	}

	@Test
	@DisplayName("GET は limit を省くと 20 で呼ぶ")
	void getDefaultsLimitTo20() throws Exception {
		when(likeService.likers(POST_ID, null, 20)).thenReturn(new PageResponse<>(List.of(), null));

		mockMvc.perform(get("/api/posts/{id}/likes", POST_ID).with(me()))
				.andExpect(status().isOk());

		verify(likeService).likers(POST_ID, null, 20);
	}

	@ParameterizedTest(name = "limit={0}")
	@ValueSource(strings = { "51", "0" })
	@DisplayName("GET は limit が範囲外なら 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidLimitReturns400(String limit) throws Exception {
		mockMvc.perform(get("/api/posts/{id}/likes", POST_ID).param("limit", limit).with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(likeService);
	}

	@Test
	@DisplayName("GET は cursor が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidCursorReturns400() throws Exception {
		mockMvc.perform(get("/api/posts/{id}/likes", POST_ID).param("cursor", "abc").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(likeService);
	}

	@ParameterizedTest(name = "{0} /api/posts/abc")
	@ValueSource(strings = { "PUT", "DELETE", "GET" })
	@DisplayName("id が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void nonUuidIdReturns400(String method) throws Exception {
		MockHttpServletRequestBuilder request = switch (method) {
			case "PUT" -> put("/api/posts/abc/like");
			case "DELETE" -> delete("/api/posts/abc/like");
			case "GET" -> get("/api/posts/abc/likes");
			default -> throw new IllegalArgumentException(method);
		};

		mockMvc.perform(request.with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(likeService);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "PUT", "DELETE", "GET" })
	@DisplayName("Bearer が無ければ 401 UNAUTHENTICATED になり、サービスは呼ばれない")
	void requestsWithoutBearerReturn401(String method) throws Exception {
		RequestBuilder request = switch (method) {
			case "PUT" -> put("/api/posts/{id}/like", POST_ID);
			case "DELETE" -> delete("/api/posts/{id}/like", POST_ID);
			case "GET" -> get("/api/posts/{id}/likes", POST_ID);
			default -> throw new IllegalArgumentException(method);
		};

		mockMvc.perform(request)
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verifyNoInteractions(likeService);
	}

	@Test
	@DisplayName("サービスの NotFoundException は 404 NOT_FOUND の Problem Details になる")
	void notFoundReturns404() throws Exception {
		doThrow(new NotFoundException()).when(likeService).unlike(USER_ID, POST_ID);

		mockMvc.perform(delete("/api/posts/{id}/like", POST_ID).with(me()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

}
