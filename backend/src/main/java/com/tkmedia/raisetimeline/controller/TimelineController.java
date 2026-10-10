package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.service.TimelineService;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TimelineController {

	private final TimelineService timelineService;

	public TimelineController(TimelineService timelineService) {
		this.timelineService = timelineService;
	}

	/**
	 * {@code cursor} が UUID でないときは、Spring の型変換の失敗として既存の経路で 400 になる。
	 * {@code limit} の範囲は {@link PageLimits#check} で確かめる。
	 */
	@GetMapping("/api/timeline/all")
	public PageResponse<PostResponse> all(@AuthenticationPrincipal Jwt jwt,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return timelineService.all(CurrentUser.idOf(jwt), cursor, PageLimits.check(limit));
	}

	/** {@code cursor} と {@code limit} の扱いは {@link #all} と同じ。 */
	@GetMapping("/api/timeline/following")
	public PageResponse<PostResponse> following(@AuthenticationPrincipal Jwt jwt,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return timelineService.following(CurrentUser.idOf(jwt), cursor, PageLimits.check(limit));
	}

}
