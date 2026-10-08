package com.tkmedia.raisetimeline.logging;

/**
 * 出来事の名前（{@link LogFields#EVENT_ACTION} の値）。
 *
 * <p>ここには基盤が書く出来事だけを置く。それ以外の出来事は、それを書く機能の Issue で足す。
 */
public final class LogEvents {

	public static final String HTTP_REQUEST = "http.request";
	public static final String HTTP_REQUEST_FAILED = "http.request.failed";
	public static final String HEALTH_DB_UNREACHABLE = "health.db_unreachable";

	private LogEvents() {
	}

}
