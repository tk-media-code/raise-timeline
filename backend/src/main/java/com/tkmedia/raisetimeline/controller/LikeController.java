package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.service.LikeService;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LikeController {

	private final LikeService likeService;

	public LikeController(LikeService likeService) {
		this.likeService = likeService;
	}

	@PutMapping("/api/posts/{id}/like")
	public ResponseEntity<Void> like(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		likeService.like(CurrentUser.idOf(jwt), id);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("/api/posts/{id}/like")
	public ResponseEntity<Void> unlike(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		likeService.unlike(CurrentUser.idOf(jwt), id);
		return ResponseEntity.noContent().build();
	}

	/**
	 * {@code cursor} が UUID でないときは、Spring の型変換の失敗として既存の経路で 400 になる。
	 * {@code limit} の範囲は {@link PageLimits#check} で確かめる。
	 */
	@GetMapping("/api/posts/{id}/likes")
	public PageResponse<UserCard> likers(@PathVariable UUID id,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return likeService.likers(id, cursor, PageLimits.check(limit));
	}

}
