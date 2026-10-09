package com.tkmedia.raisetimeline.controller;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserDetail;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.service.UserPostsService;
import com.tkmedia.raisetimeline.service.UserService;
import java.time.OffsetDateTime;
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

	@MockitoBean
	private UserPostsService userPostsService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

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

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "/api/users/alice", "/api/users/alice/posts" })
	@DisplayName("Bearer が無いプロフィールの API は 401 UNAUTHENTICATED になり、サービスは呼ばれない")
	void requestsWithoutBearerReturn401(String path) throws Exception {
		mockMvc.perform(get(path))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verifyNoInteractions(userService, userPostsService);
	}

	@Test
	@DisplayName("プロフィールは 200 で返り、email は無く、isMe と isFollowing が出る")
	void profileHasNoEmail() throws Exception {
		UUID otherId = UUID.fromString("0199b000-0000-7000-8000-000000000002");
		when(userService.getProfile("bob", USER_ID)).thenReturn(new UserDetail(otherId, "bob", "ボブ", null, "よろしく",
				false, 0, 0, OffsetDateTime.parse("2026-10-01T00:00:00Z"), false));

		mockMvc.perform(get("/api/users/bob").with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("bob"))
				.andExpect(jsonPath("$.email").doesNotExist())
				.andExpect(jsonPath("$.isMe").value(false))
				.andExpect(jsonPath("$.isFollowing").value(false));
	}

	@Test
	@DisplayName("いない利用者のプロフィールは 404 NOT_FOUND")
	void profileOfMissingUserReturns404() throws Exception {
		when(userService.getProfile("ghost", USER_ID)).thenThrow(new NotFoundException());

		mockMvc.perform(get("/api/users/ghost").with(me()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	@DisplayName("その人の投稿一覧は 200 で、items と nextCursor を返す。limit の既定は 20")
	void userPostsReturnsPage() throws Exception {
		UUID postId = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
		UUID next = UUID.fromString("0199b000-0000-7000-8000-0000000000a0");
		PostResponse post = new PostResponse(postId, new UserSummary(USER_ID, "taro_1", "太郎", null), "本文",
				List.of(), 0, 0, false, false, OffsetDateTime.parse("2026-10-09T00:00:00Z"));
		when(userPostsService.postsOf("taro_1", next, 20)).thenReturn(new PageResponse<>(List.of(post), next));

		mockMvc.perform(get("/api/users/taro_1/posts").param("cursor", next.toString()).with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].id").value(postId.toString()))
				.andExpect(jsonPath("$.nextCursor").value(next.toString()));
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "limit=0", "limit=51", "limit=abc", "cursor=x" })
	@DisplayName("limit か cursor が不正なら 400 で、サービスは呼ばれない")
	void userPostsWithBadParamsReturns400(String query) throws Exception {
		String[] pair = query.split("=");

		mockMvc.perform(get("/api/users/alice/posts").param(pair[0], pair[1]).with(me()))
				.andExpect(status().isBadRequest());

		verifyNoInteractions(userPostsService);
	}

}
