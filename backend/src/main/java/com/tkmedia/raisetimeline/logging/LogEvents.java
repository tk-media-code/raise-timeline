package com.tkmedia.raisetimeline.logging;

/**
 * 出来事の名前（{@link LogFields#EVENT_ACTION} の値）。
 *
 * <p>ここには基盤・認証・投稿が書く出来事だけを置く。それ以外の出来事は、それを書く機能の Issue で足す。
 */
public final class LogEvents {

	public static final String HTTP_REQUEST = "http.request";
	public static final String HTTP_REQUEST_FAILED = "http.request.failed";
	public static final String HEALTH_DB_UNREACHABLE = "health.db_unreachable";

	// 認証。docs/logging-design.md 3 章。
	public static final String AUTH_REGISTER = "auth.register";
	public static final String AUTH_LOGIN_SUCCEEDED = "auth.login.succeeded";
	public static final String AUTH_LOGIN_FAILED = "auth.login.failed";
	public static final String AUTH_REFRESH_FAILED = "auth.refresh.failed";
	public static final String AUTH_LOGOUT = "auth.logout";
	public static final String USER_WITHDREW = "user.withdrew";

	// 投稿。docs/logging-design.md 3 章。
	public static final String POST_DELETED = "post.deleted";

	// 画像。docs/logging-design.md 3 章。
	public static final String IMAGE_DELETE_FAILED = "image.delete_failed";

	private LogEvents() {
	}

}
