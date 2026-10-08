package com.tkmedia.raisetimeline.logging;

/**
 * ログの項目名。ログに項目を足すときは、文字列を直接書かず、ここの定数を使う。
 *
 * <p>名前を 1 か所に集めるのは、綴りの揺れを防ぐためと、守らないと行が壊れる 2 つの約束
 * （docs/logging-design.md の 4 章）を、ここを見れば確かめられるようにするため。
 * <ul>
 * <li>{@code error} {@code log} {@code process} {@code service} {@code ecs} {@code message}
 * {@code @timestamp} の下に自前の項目を置かない。Spring Boot 自身が書く項目とぶつかる。</li>
 * <li>MDC に置く項目（{@link #HTTP_REQUEST_ID} {@link #CLIENT_IP} {@link #USER_ID}）を、
 * 行の項目として重ねて足さない。同じ名前の重複で行が壊れる。</li>
 * </ul>
 */
public final class LogFields {

	// MDC に置く項目。要求の間ずっと、すべての行に付く。
	public static final String HTTP_REQUEST_ID = "http.request.id";
	public static final String CLIENT_IP = "client.ip";
	public static final String USER_ID = "user.id";

	// 要求ログの項目。event.duration の単位はナノ秒。
	public static final String HTTP_REQUEST_METHOD = "http.request.method";
	public static final String URL_PATH = "url.path";
	public static final String URL_QUERY = "url.query";
	public static final String HTTP_RESPONSE_STATUS_CODE = "http.response.status_code";
	public static final String EVENT_DURATION = "event.duration";

	// 出来事の行の項目。エラー応答の code は error.code ではなく event.code に入れる（error の下は使えない）。
	public static final String EVENT_ACTION = "event.action";
	public static final String EVENT_CODE = "event.code";

	// ECS の辞書に無い、このアプリ固有の値。
	public static final String APP_POST_ID = "app.post.id";
	public static final String APP_COMMENT_ID = "app.comment.id";
	public static final String APP_IMAGE_KEYS = "app.image.keys";

	private LogFields() {
	}

}
