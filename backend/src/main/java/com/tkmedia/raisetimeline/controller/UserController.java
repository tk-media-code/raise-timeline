package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.service.UserService;
import java.util.Objects;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

	private final UserService userService;

	public UserController(UserService userService) {
		this.userService = userService;
	}

	/** ログイン中の本人の情報。利用者 id は、署名を確かめた JWT の sub から取る。 */
	@GetMapping("/api/users/me")
	public Me me(@AuthenticationPrincipal Jwt jwt) {
		return userService.getMe(UUID.fromString(Objects.requireNonNull(jwt.getSubject())));
	}

}
