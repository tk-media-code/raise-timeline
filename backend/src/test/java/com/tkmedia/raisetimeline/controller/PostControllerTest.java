package com.tkmedia.raisetimeline.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.tkmedia.raisetimeline.config.ClockConfig;
import com.tkmedia.raisetimeline.config.LoggingConfig;
import com.tkmedia.raisetimeline.config.SecurityConfig;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UserSummary;
import com.tkmedia.raisetimeline.error.ApiExceptionHandler;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.service.PostService;
import java.nio.charset.StandardCharsets;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(controllers = PostController.class)
@Import({ SecurityConfig.class, ApiExceptionHandler.class, LoggingConfig.class, ClockConfig.class,
		ProblemDetailWriter.class })
@TestPropertySource(properties = {
		"auth.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbG9uZyE=",
		"auth.issuer=raise-timeline" })
class PostControllerTest {

	private static final UUID USER_ID = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private PostService postService;

	private static RequestPostProcessor me() {
		return jwt().jwt(j -> j.subject(USER_ID.toString()));
	}

	private static PostResponse response(String body) {
		return new PostResponse(POST_ID, new UserSummary(USER_ID, "taro_1", "太郎", null), body, List.of(), 0, 0,
				false, false, OffsetDateTime.parse("2026-10-09T00:00:00Z"));
	}

	@Test
	@DisplayName("Bearer が無い投稿は 401 になり、サービスは呼ばれない")
	void createRequiresBearer() throws Exception {
		mockMvc.perform(multipart("/api/posts").param("body", "こんにちは"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

		verifyNoInteractions(postService);
	}

	@Test
	@DisplayName("本文だけの multipart は 201 で、暫定の値が入った投稿を返す")
	void createReturns201() throws Exception {
		when(postService.create(USER_ID, "こんにちは")).thenReturn(response("こんにちは"));

		mockMvc.perform(multipart("/api/posts").param("body", "こんにちは").with(me()))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.body").value("こんにちは"))
				.andExpect(jsonPath("$.author.username").value("taro_1"))
				.andExpect(jsonPath("$.images").isArray())
				.andExpect(jsonPath("$.images").isEmpty())
				.andExpect(jsonPath("$.likeCount").value(0))
				.andExpect(jsonPath("$.commentCount").value(0))
				.andExpect(jsonPath("$.likedByMe").value(false))
				.andExpect(jsonPath("$.edited").value(false));

		verify(postService).create(USER_ID, "こんにちは");
	}

	@Test
	@DisplayName("images の部品があると 503 IMAGE_STORAGE_UNAVAILABLE になり、サービスは呼ばれない")
	void createWithImagesReturns503() throws Exception {
		MockMultipartFile image = new MockMultipartFile("images", "a.png", "image/png", new byte[] { 1, 2, 3 });

		mockMvc.perform(multipart("/api/posts").file(image).param("body", "こんにちは").with(me()))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.code").value("IMAGE_STORAGE_UNAVAILABLE"))
				.andExpect(jsonPath("$.detail").value("画像の保存が設定されていません"));

		verifyNoInteractions(postService);
	}

	@Test
	@DisplayName("body の部品が無い multipart は 400 BAD_REQUEST")
	void createWithoutBodyPartReturns400() throws Exception {
		mockMvc.perform(multipart("/api/posts").with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verify(postService, never()).create(any(), any());
	}

	@Test
	@DisplayName("JSON で送ると 415 UNSUPPORTED_MEDIA_TYPE")
	void createWithJsonReturns415() throws Exception {
		mockMvc.perform(post("/api/posts").contentType(MediaType.APPLICATION_JSON)
				.content("{\"body\":\"こんにちは\"}".getBytes(StandardCharsets.UTF_8)).with(me()))
				.andExpect(status().isUnsupportedMediaType())
				.andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));

		verifyNoInteractions(postService);
	}

	@Test
	@DisplayName("GET /api/posts は 405 METHOD_NOT_ALLOWED（一覧は /api/timeline）")
	void listPostsIsNotAllowed() throws Exception {
		mockMvc.perform(get("/api/posts").with(me()))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
	}

	@Test
	@DisplayName("サービスが ValidationException を投げると 422 で、errors に body が入る")
	void validationErrorReturns422() throws Exception {
		when(postService.create(USER_ID, " ")).thenThrow(
				new ValidationException(List.of(new FieldError("body", "本文か画像を入れてください"))));

		mockMvc.perform(multipart("/api/posts").param("body", " ").with(me()))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("body"))
				.andExpect(jsonPath("$.errors[0].message").value("本文か画像を入れてください"));
	}

	@ParameterizedTest(name = "{0} /api/posts/abc")
	@ValueSource(strings = { "GET", "PATCH", "DELETE" })
	@DisplayName("id が UUID でないと 400 BAD_REQUEST")
	void nonUuidIdReturns400(String method) throws Exception {
		var request = switch (method) {
			case "GET" -> get("/api/posts/abc");
			case "PATCH" -> patch("/api/posts/abc").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}");
			default -> delete("/api/posts/abc");
		};

		mockMvc.perform(request.with(me()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("BAD_REQUEST"));

		verifyNoInteractions(postService);
	}

	@Test
	@DisplayName("GET は投稿を 200 で返す")
	void getReturns200() throws Exception {
		when(postService.get(POST_ID)).thenReturn(response("本文"));

		mockMvc.perform(get("/api/posts/" + POST_ID).with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(POST_ID.toString()))
				.andExpect(jsonPath("$.body").value("本文"));
	}

	@Test
	@DisplayName("GET は無い投稿で 404 NOT_FOUND")
	void getMissingReturns404() throws Exception {
		when(postService.get(POST_ID)).thenThrow(new NotFoundException());

		mockMvc.perform(get("/api/posts/" + POST_ID).with(me()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	@DisplayName("PATCH は本文を直して 200 で返す")
	void updateReturns200() throws Exception {
		when(postService.updateBody(USER_ID, POST_ID, "直した")).thenReturn(response("直した"));

		mockMvc.perform(patch("/api/posts/" + POST_ID).contentType(MediaType.APPLICATION_JSON)
				.content("{\"body\":\"直した\"}".getBytes(StandardCharsets.UTF_8)).with(me()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.body").value("直した"));
	}

	@Test
	@DisplayName("PATCH は body が欠けていても null としてサービスに渡る")
	void updateWithoutBodyPassesNull() throws Exception {
		when(postService.updateBody(USER_ID, POST_ID, null)).thenThrow(
				new ValidationException(List.of(new FieldError("body", "本文か画像を入れてください"))));

		mockMvc.perform(patch("/api/posts/" + POST_ID).contentType(MediaType.APPLICATION_JSON).content("{}")
				.with(me()))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.errors[0].field").value("body"));
	}

	@Test
	@DisplayName("他人の投稿の PATCH は 403 FORBIDDEN")
	void updateOthersReturns403() throws Exception {
		when(postService.updateBody(USER_ID, POST_ID, "直した")).thenThrow(new ForbiddenException());

		mockMvc.perform(patch("/api/posts/" + POST_ID).contentType(MediaType.APPLICATION_JSON)
				.content("{\"body\":\"直した\"}".getBytes(StandardCharsets.UTF_8)).with(me()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("FORBIDDEN"));
	}

	@Test
	@DisplayName("DELETE は 204 で、本文は空")
	void deleteReturns204() throws Exception {
		mockMvc.perform(delete("/api/posts/" + POST_ID).with(me()))
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));

		verify(postService).delete(USER_ID, POST_ID);
	}

	@Test
	@DisplayName("サービスが UnauthenticatedException を投げると 401 UNAUTHENTICATED")
	void unauthenticatedFromServiceReturns401() throws Exception {
		doThrow(new UnauthenticatedException()).when(postService).create(USER_ID, "こんにちは");

		mockMvc.perform(multipart("/api/posts").param("body", "こんにちは").with(me()))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

}
