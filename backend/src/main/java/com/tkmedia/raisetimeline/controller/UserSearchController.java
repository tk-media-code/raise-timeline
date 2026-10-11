package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.UserCard;
import com.tkmedia.raisetimeline.service.UserSearchService;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code q} を {@code required = false} にするのは、無いときも空のときと同じ 422（検索する語を入力してください）に
 * そろえるため。必須にすると、無いときだけ Spring が 400 にしてしまう。検証はサービスが行う。
 */
@RestController
public class UserSearchController {

	private final UserSearchService userSearchService;

	public UserSearchController(UserSearchService userSearchService) {
		this.userSearchService = userSearchService;
	}

	/**
	 * {@code cursor} が UUID でないときは、Spring の型変換の失敗として既存の経路で 400 になる。
	 * {@code limit} の範囲は {@link PageLimits#check} で確かめる。
	 */
	@GetMapping("/api/users")
	public PageResponse<UserCard> search(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String q,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return userSearchService.search(CurrentUser.idOf(jwt), q, cursor, PageLimits.check(limit));
	}

}
