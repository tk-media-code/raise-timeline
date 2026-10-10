package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.service.FollowService;
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

/**
 * パスの {@code username} は検査せずそのままサービスに渡す。規則に合わない名前は
 * {@code UserService.requireByUsername} が 404 にする。
 */
@RestController
public class FollowController {

	private final FollowService followService;

	public FollowController(FollowService followService) {
		this.followService = followService;
	}

	@PutMapping("/api/users/{username}/follow")
	public ResponseEntity<Void> follow(@AuthenticationPrincipal Jwt jwt, @PathVariable String username) {
		followService.follow(CurrentUser.idOf(jwt), username);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("/api/users/{username}/follow")
	public ResponseEntity<Void> unfollow(@AuthenticationPrincipal Jwt jwt, @PathVariable String username) {
		followService.unfollow(CurrentUser.idOf(jwt), username);
		return ResponseEntity.noContent().build();
	}

	/**
	 * {@code cursor} が UUID でないときは、Spring の型変換の失敗として既存の経路で 400 になる。
	 * {@code limit} の範囲は {@link PageLimits#check} で確かめる。
	 */
	@GetMapping("/api/users/{username}/followers")
	public PageResponse<UserCard> followers(@AuthenticationPrincipal Jwt jwt, @PathVariable String username,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return followService.followers(CurrentUser.idOf(jwt), username, cursor, PageLimits.check(limit));
	}

	@GetMapping("/api/users/{username}/following")
	public PageResponse<UserCard> following(@AuthenticationPrincipal Jwt jwt, @PathVariable String username,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return followService.following(CurrentUser.idOf(jwt), username, cursor, PageLimits.check(limit));
	}

}
