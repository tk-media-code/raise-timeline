package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.AuthResponse;
import com.tkmedia.raisetimeline.dto.LoginRequest;
import com.tkmedia.raisetimeline.dto.RegisterRequest;
import com.tkmedia.raisetimeline.service.AuthResult;
import com.tkmedia.raisetimeline.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 登録・ログイン・更新・ログアウト。
 *
 * <p>Cookie は、サービスの呼び出しが成功した後で {@link ResponseEntity} のヘッダーとして付ける。
 * {@code HttpServletResponse} に先に書くと、その後に例外が起きたとき、{@code ProblemDetailWriter} は本文しか
 * 捨てないので、Cookie が失敗の応答に残ってしまう。更新が 401 のときに Cookie を消さないのも同じ仕組みで、
 * 失敗の経路では何も付けない（docs/auth-design.md 3 章）。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService authService;
	private final RefreshTokenCookies cookies;

	public AuthController(AuthService authService, RefreshTokenCookies cookies) {
		this.authService = authService;
		this.cookies = cookies;
	}

	@PostMapping("/register")
	public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
		return respond(HttpStatus.CREATED, authService.register(request));
	}

	@PostMapping("/login")
	public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
		return respond(HttpStatus.OK, authService.login(request));
	}

	/** Cookie が無ければ null のままサービスに渡す。失敗のログと 401 はサービスが決める。 */
	@PostMapping("/refresh")
	public ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
		return respond(HttpStatus.OK, authService.refresh(cookies.read(request)));
	}

	/** Cookie が無くても必ずサービスを呼ぶ（ログの記録はサービスの仕事）。いずれの場合も 204 で Cookie を消す。 */
	@PostMapping("/logout")
	public ResponseEntity<Void> logout(HttpServletRequest request) {
		authService.logout(cookies.read(request));
		return ResponseEntity.noContent()
				.header(HttpHeaders.SET_COOKIE, cookies.clear().toString())
				.build();
	}

	private ResponseEntity<AuthResponse> respond(HttpStatus status, AuthResult result) {
		return ResponseEntity.status(status)
				.header(HttpHeaders.SET_COOKIE, cookies.issue(result.refreshToken()).toString())
				.body(new AuthResponse(result.accessToken(), result.me()));
	}

}
