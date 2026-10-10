package com.tkmedia.raisetimeline.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.CommentResponse;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import com.tkmedia.raisetimeline.service.CommentService;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(controllers = CommentController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class CommentControllerTest {

	// jwtDecoder が存在確認に使う。
	@MockitoBean
	private UserMapper userMapper;

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final UUID COMMENT_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000c1");
	private static final UUID CURSOR = UUID.fromString("0199b000-0000-7000-8000-0000000000c2");
	private static final OffsetDateTime CREATED_AT = OffsetDateTime.of(2026, 10, 11, 1, 2, 3, 0, ZoneOffset.UTC);

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private CommentService commentService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

	private static CommentResponse response(String body) {
		return new CommentResponse(COMMENT_ID, new UserSummary(USER_ID, "taro", "太郎", "https://images.test/a.png"),
				body, CREATED_AT);
	}

	private static MockHttpServletRequestBuilder postJson(String json) {
		return post("/api/posts/{id}/comments", POST_ID).contentType(MediaType.APPLICATION_JSON)
				.content(json.getBytes(StandardCharsets.UTF_8));
	}

	@Test
	@DisplayName("POST は 201 で、create(sub, id, 本文) を呼び、id・author・body・createdAt を返す")
	void postReturns201() throws Exception {
		when(commentService.create(USER_ID, POST_ID, "こんにちは")).thenReturn(response("こんにちは"));

		mockMvc.perform(postJson("{\"body\":\"こんにちは\"}").with(me()))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").value(COMMENT_ID.toString()))
				.andExpect(jsonPath("$.author.id").value(USER_ID.toString()))
				.andExpect(jsonPath("$.author.username").value("taro"))
				.andExpect(jsonPath("$.author.displayName").value("太郎"))
				.andExpect(jsonPath("$.author.avatarUrl").value("https://images.test/a.png"))
				.andExpect(jsonPath("$.body").value("こんにちは"))
				.andExpect(jsonPath("$.createdAt").exists());

		verify(commentService).create(USER_ID, POST_ID, "こんにちは");
	}

	@Test
	@DisplayName("POST で body の鍵が無ければ、null のままサービスに渡す")
	void postWithoutBodyPassesNull() throws Exception {
		when(commentService.create(USER_ID, POST_ID, null)).thenThrow(
				new ValidationException(List.of(new FieldError("body", "1〜280 文字で入力してください"))));

		mockMvc.perform(postJson("{}").with(me()))
				.andExpect(status().isUnprocessableContent());

		verify(commentService).create(USER_ID, POST_ID, null);
	}

	@Test
	@DisplayName("POST の JSON が壊れていれば 400 BAD_REQUEST で、サービスは呼ばれない")
	void postWithBrokenJsonReturns400() throws Exception {
		mockMvc.perform(postJson("{").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(commentService);
	}

	@Test
	@DisplayName("GET は 200 で items と nextCursor を返す")
	void getReturnsPage() throws Exception {
		when(commentService.list(POST_ID, CURSOR, 5))
				.thenReturn(new PageResponse<>(List.of(response("一件目")), CURSOR));

		mockMvc.perform(get("/api/posts/{id}/comments", POST_ID).param("cursor", CURSOR.toString())
				.param("limit", "5").with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].id").value(COMMENT_ID.toString()))
				.andExpect(jsonPath("$.items[0].author.username").value("taro"))
				.andExpect(jsonPath("$.items[0].body").value("一件目"))
				.andExpect(jsonPath("$.nextCursor").value(CURSOR.toString()));
	}

	@Test
	@DisplayName("GET は limit を省くと 20 で呼ぶ")
	void getDefaultsLimitTo20() throws Exception {
		when(commentService.list(POST_ID, null, 20)).thenReturn(new PageResponse<>(List.of(), null));

		mockMvc.perform(get("/api/posts/{id}/comments", POST_ID).with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.nextCursor").doesNotExist());

		verify(commentService).list(POST_ID, null, 20);
	}

	@ParameterizedTest(name = "limit={0}")
	@ValueSource(strings = { "0", "51" })
	@DisplayName("GET は limit が範囲外なら 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidLimitReturns400(String limit) throws Exception {
		mockMvc.perform(get("/api/posts/{id}/comments", POST_ID).param("limit", limit).with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(commentService);
	}

	@Test
	@DisplayName("GET は cursor が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void invalidCursorReturns400() throws Exception {
		mockMvc.perform(get("/api/posts/{id}/comments", POST_ID).param("cursor", "abc").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(commentService);
	}

	@Test
	@DisplayName("DELETE は 204 で、delete(sub, id) を呼ぶ")
	void deleteReturns204() throws Exception {
		mockMvc.perform(delete("/api/comments/{id}", COMMENT_ID).with(me()))
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));

		verify(commentService).delete(USER_ID, COMMENT_ID);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "POST", "GET", "DELETE" })
	@DisplayName("パスの id が UUID でないと 400 BAD_REQUEST で、サービスは呼ばれない")
	void nonUuidIdReturns400(String method) throws Exception {
		MockHttpServletRequestBuilder request = switch (method) {
			case "POST" -> post("/api/posts/abc/comments").contentType(MediaType.APPLICATION_JSON)
					.content("{\"body\":\"a\"}");
			case "GET" -> get("/api/posts/abc/comments");
			case "DELETE" -> delete("/api/comments/abc");
			default -> throw new IllegalArgumentException(method);
		};

		mockMvc.perform(request.with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(commentService);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = { "POST", "GET", "DELETE" })
	@DisplayName("Bearer が無ければ 401 UNAUTHENTICATED になり、サービスは呼ばれない")
	void requestsWithoutBearerReturn401(String method) throws Exception {
		RequestBuilder request = switch (method) {
			case "POST" -> post("/api/posts/{id}/comments", POST_ID).contentType(MediaType.APPLICATION_JSON)
					.content("{\"body\":\"a\"}");
			case "GET" -> get("/api/posts/{id}/comments", POST_ID);
			case "DELETE" -> delete("/api/comments/{id}", COMMENT_ID);
			default -> throw new IllegalArgumentException(method);
		};

		mockMvc.perform(request)
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verifyNoInteractions(commentService);
	}

	@Test
	@DisplayName("サービスの NotFoundException は 404 NOT_FOUND の Problem Details になる")
	void notFoundReturns404() throws Exception {
		when(commentService.create(any(), any(), any())).thenThrow(new NotFoundException());

		mockMvc.perform(postJson("{\"body\":\"a\"}").with(me()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	@DisplayName("サービスの ForbiddenException は 403 FORBIDDEN の Problem Details になる")
	void forbiddenReturns403() throws Exception {
		doThrow(new ForbiddenException()).when(commentService).delete(USER_ID, COMMENT_ID);

		mockMvc.perform(delete("/api/comments/{id}", COMMENT_ID).with(me()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("FORBIDDEN"));
	}

	@Test
	@DisplayName("サービスの ValidationException は 422 VALIDATION_ERROR で、errors[0].field が body")
	void validationReturns422() throws Exception {
		when(commentService.create(any(), any(), any())).thenThrow(
				new ValidationException(List.of(new FieldError("body", "使えない文字が含まれています"))));

		mockMvc.perform(postJson("{\"body\":\"a\"}").with(me()))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("body"))
				.andExpect(jsonPath("$.errors[0].message").value("使えない文字が含まれています"));
	}

}
