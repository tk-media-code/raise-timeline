package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UpdatePostRequest;
import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
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
	 * 画像が無くても multipart で送る（API の形を、画像を足す Issue 5 で変えないため）。
	 * 画像の保存先はまだ無いので、{@code images} に部品が 1 つでもあれば、本文の検査より先に 503 にする。
	 * 黙って捨てると、画像が付いたと思った利用者に嘘をつく。サービスには本文だけを渡す。
	 */
	@PostMapping(path = "/api/posts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<PostResponse> create(@AuthenticationPrincipal Jwt jwt,
			@RequestParam("body") String body,
			@RequestParam(name = "images", required = false) List<MultipartFile> images) {
		if (images != null && !images.isEmpty()) {
			throw new ImageStorageUnavailableException();
		}
		return ResponseEntity.status(HttpStatus.CREATED).body(postService.create(CurrentUser.idOf(jwt), body));
	}

	@GetMapping("/api/posts/{id}")
	public PostResponse get(@PathVariable UUID id) {
		return postService.get(id);
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
