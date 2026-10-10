package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UpdatePostRequest;
import com.tkmedia.raisetimeline.service.PostService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class PostController {

	private final PostService postService;

	public PostController(PostService postService) {
		this.postService = postService;
	}

	/**
	 * 画像が無くても multipart で送る（画像の有無で API の形を変えないため）。
	 * 画像の部品は送られた順のままサービスに渡す。保存先が使えないときの 503 や、枚数・大きさ・形式の検査は
	 * サービスの仕事で、ここでは判定しない（本文の検査との順序を 1 か所で決めるため）。
	 * 部品が 1 つも無いときは {@code images} が null で届くので、空のリストにしてから渡す。
	 */
	@PostMapping(path = "/api/posts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<PostResponse> create(@AuthenticationPrincipal Jwt jwt,
			@RequestParam("body") String body,
			@RequestParam(name = "images", required = false) List<MultipartFile> images) {
		List<MultipartFile> parts = images == null ? List.of() : images;
		return ResponseEntity.status(HttpStatus.CREATED).body(postService.create(CurrentUser.idOf(jwt), body, parts));
	}

	@GetMapping("/api/posts/{id}")
	public PostResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		return postService.get(CurrentUser.idOf(jwt), id);
	}

	@PatchMapping("/api/posts/{id}")
	public PostResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@RequestBody UpdatePostRequest request) {
		return postService.updateBody(CurrentUser.idOf(jwt), id, request.body());
	}

	@DeleteMapping("/api/posts/{id}")
	public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		postService.delete(CurrentUser.idOf(jwt), id);
		return ResponseEntity.noContent().build();
	}

}
