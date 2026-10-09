package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.dto.AvatarResponse;
import com.tkmedia.raisetimeline.dto.Me;
import com.tkmedia.raisetimeline.dto.PageResponse;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.dto.UpdateProfileRequest;
import com.tkmedia.raisetimeline.dto.UserDetail;
import com.tkmedia.raisetimeline.service.AvatarService;
import com.tkmedia.raisetimeline.service.UserPostsService;
import com.tkmedia.raisetimeline.service.UserService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class UserController {

	private final UserService userService;
	private final UserPostsService userPostsService;
	private final AvatarService avatarService;

	public UserController(UserService userService, UserPostsService userPostsService,
			AvatarService avatarService) {
		this.userService = userService;
		this.userPostsService = userPostsService;
		this.avatarService = avatarService;
	}

	/** ログイン中の本人の情報。利用者 id は、署名を確かめた JWT の sub から取る。 */
	@GetMapping("/api/users/me")
	public Me me(@AuthenticationPrincipal Jwt jwt) {
		return userService.getMe(CurrentUser.idOf(jwt));
	}

	/**
	 * 本人の表示名と自己紹介を更新する。対象は JWT の sub の本人だけで、パスに id やユーザー名は取らない
	 * （他人のプロフィールは更新できない）。
	 */
	@PatchMapping("/api/users/me")
	public Me updateMe(@Valid @RequestBody UpdateProfileRequest request, @AuthenticationPrincipal Jwt jwt) {
		return userService.updateProfile(CurrentUser.idOf(jwt), request);
	}

	/**
	 * 本人のアイコンを差し替える。対象は JWT の sub の本人だけ。保存先が使えないときの 503 や、大きさ・形式の検査は
	 * サービスの仕事で、ここでは判定しない。{@code file} の部品が無ければ Spring が 400 にする。
	 */
	@PutMapping(path = "/api/users/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public AvatarResponse replaceAvatar(@AuthenticationPrincipal Jwt jwt, @RequestParam("file") MultipartFile file) {
		return avatarService.replace(CurrentUser.idOf(jwt), file);
	}

	/**
	 * 他人にも見せるプロフィール。{@code /api/users/me} は固定のパスなので、こちらより先に選ばれる。
	 * 規則に合わない名前は、サービスが DB に問い合わせずに 404 にする。
	 */
	@GetMapping("/api/users/{username}")
	public UserDetail profile(@PathVariable String username, @AuthenticationPrincipal Jwt jwt) {
		return userService.getProfile(username, CurrentUser.idOf(jwt));
	}

	/**
	 * その人の投稿一覧。{@code cursor} が UUID でないときは Spring の型変換の失敗として 400 になり、
	 * {@code limit} の範囲は {@link PageLimits#check} で確かめる（{@link TimelineController} と同じ）。
	 */
	@GetMapping("/api/users/{username}/posts")
	public PageResponse<PostResponse> posts(@PathVariable String username,
			@RequestParam(required = false) UUID cursor,
			@RequestParam(defaultValue = PageLimits.DEFAULT_VALUE) int limit) {
		return userPostsService.postsOf(username, cursor, PageLimits.check(limit));
	}

}
