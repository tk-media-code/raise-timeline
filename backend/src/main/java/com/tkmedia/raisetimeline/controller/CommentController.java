package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.CommentResponse;
import com.tkmedia.raisetimeline.dto.CreateCommentRequest;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.service.CommentService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CommentController {

	private final CommentService commentService;

	public CommentController(CommentService commentService) {
		this.commentService = commentService;
	}

	@PostMapping("/api/posts/{id}/comments")
	public ResponseEntity<CommentResponse> create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@RequestBody CreateCommentRequest request) {
		CommentResponse created = commentService.create(CurrentUser.idOf(jwt), id, request.body());
		return ResponseEntity.status(HttpStatus.CREATED).body(created);
	}

	/**
	 * {@code cursor} が UUID でないときは、Spring の型変換の失敗として既存の経路で 400 になる。
	 * {@code limit} の範囲は {@link PageLimits#check} で確かめる。
	 */
	@GetMapping("/api/posts/{id}/comments")
	public PageResponse<CommentResponse> list(@PathVariable UUID id,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return commentService.list(id, cursor, PageLimits.check(limit));
	}

	@DeleteMapping("/api/comments/{id}")
	public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		commentService.delete(CurrentUser.idOf(jwt), id);
		return ResponseEntity.noContent().build();
	}

}
