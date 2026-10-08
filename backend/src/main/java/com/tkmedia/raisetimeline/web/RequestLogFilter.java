package com.tkmedia.raisetimeline.web;

import com.tkmedia.raisetimeline.controller.HealthCheckController;
import com.tkmedia.raisetimeline.error.ErrorCode;
import com.tkmedia.raisetimeline.error.InternalErrorLog;
import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.slf4j.spi.LoggingEventBuilder;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 要求ごとに requestId を決めて MDC に置き、要求が終わったら要求ログを 1 行書いて MDC を消す。
 *
 * <p>MDC を消すのはこのフィルタだけ。他の場所（認証の {@code user.id} など）は置きっぱなしにしてよい。
 * Tomcat のスレッドは使い回されるので、消し忘れると次の要求の行に前の利用者の値が載ってしまう。
 */
public class RequestLogFilter extends OncePerRequestFilter {

	public static final String REQUEST_ID_HEADER = "X-Request-Id";

	/** 遅い要求の閾値。非機能要件の「通常の操作は 1 秒以内」から取った。これを超えたら WARN にする。 */
	public static final Duration SLOW_REQUEST_THRESHOLD = Duration.ofSeconds(1);

	/**
	 * Spring Security のフィルタ（順番 -100）より前で動かすための順番。
	 * 認証で弾かれた 401 や 403 の応答にも requestId を付け、要求ログに残すため。
	 * 最優先（HIGHEST_PRECEDENCE）そのものにしないのは、将来これより前に置きたいものの余地を残すため。
	 */
	public static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 10;

	/** 利用者が送る値をログとヘッダーにそのまま通さないための形。ログの注入や巨大な値を防ぐ。 */
	private static final Pattern VALID_REQUEST_ID = Pattern.compile("^[A-Za-z0-9-]{1,64}$");

	/** 属性名は他と重ならないよう、クラス名つきにする。 */
	private static final String ERROR_CODE_ATTRIBUTE = RequestLogFilter.class.getName() + ".errorCode";

	private static final Logger log = LoggerFactory.getLogger(RequestLogFilter.class);

	private final Clock clock;
	private final ProblemDetailWriter writer;

	public RequestLogFilter(Clock clock, ProblemDetailWriter writer) {
		this.clock = clock;
		this.writer = writer;
	}

	/**
	 * エラー応答の code を要求に置く。要求ログが {@code event.code} として読む。
	 * Problem Details を書く側が呼ぶ。
	 */
	public static void setErrorCode(ServletRequest request, String code) {
		request.setAttribute(ERROR_CODE_ATTRIBUTE, code);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String requestId = resolveRequestId(request);
		Instant start = clock.instant();
		try {
			// MDC への書き込みも try の中に置く。途中で失敗しても、下の finally で必ず MDC を消すため。
			MDC.put(LogFields.HTTP_REQUEST_ID, requestId);
			MDC.put(LogFields.CLIENT_IP, request.getRemoteAddr());
			response.setHeader(REQUEST_ID_HEADER, requestId);
			try {
				chain.doFilter(request, response);
			} catch (ServletException | RuntimeException e) {
				// MVC の外（後ろのフィルタなど）で漏れた例外。ここで 500 の Problem Details にして終わらせる。
				// 投げ直さない。投げ直すと Tomcat がもう 1 回 ERROR を書き、500 1 件につき ERROR が 2 行になる。
				// IOException は捕まえない。接続が切れたなど相手側の事情で、こちらの失敗ではないため。
				InternalErrorLog.write(e);
				// 応答を先に確定させる。要求ログ（下の finally）が status 500 と code を読めるように。
				writer.write(request, response, ErrorCode.INTERNAL_ERROR);
			}
		} finally {
			// 例外が抜けてきても、要求ログを書き、MDC を消す。
			try {
				writeRequestLog(request, response, Duration.between(start, clock.instant()));
			} finally {
				MDC.clear();
			}
		}
	}

	private static String resolveRequestId(HttpServletRequest request) {
		String submitted = request.getHeader(REQUEST_ID_HEADER);
		if (submitted != null && VALID_REQUEST_ID.matcher(submitted).matches()) {
			return submitted;
		}
		// nginx の $request_id と同じ形（ハイフン無しの 32 文字の小文字 16 進）にそろえる。
		return UUID.randomUUID().toString().replace("-", "");
	}

	private void writeRequestLog(HttpServletRequest request, HttpServletResponse response, Duration duration) {
		int status = response.getStatus();
		LoggingEventBuilder event = log.atLevel(levelOf(request, status, duration))
				.addKeyValue(LogFields.HTTP_REQUEST_METHOD, request.getMethod())
				.addKeyValue(LogFields.URL_PATH, request.getRequestURI())
				.addKeyValue(LogFields.HTTP_RESPONSE_STATUS_CODE, status)
				.addKeyValue(LogFields.EVENT_DURATION, duration.toNanos())
				.addKeyValue(LogFields.EVENT_ACTION, LogEvents.HTTP_REQUEST);
		// 値が無い項目は、null で出さず項目ごと出さない。
		String query = request.getQueryString();
		if (query != null) {
			event = event.addKeyValue(LogFields.URL_QUERY, query);
		}
		Object errorCode = request.getAttribute(ERROR_CODE_ATTRIBUTE);
		if (errorCode instanceof String code) {
			event = event.addKeyValue(LogFields.EVENT_CODE, code);
		}
		event.log("要求を処理した");
	}

	private static Level levelOf(HttpServletRequest request, int status, Duration duration) {
		if (duration.compareTo(SLOW_REQUEST_THRESHOLD) > 0) {
			return Level.WARN;
		}
		// ALB が 30 秒ごとに叩くヘルスチェックの成功は、INFO を埋めないよう DEBUG に落とす。
		if ("GET".equals(request.getMethod())
				&& HealthCheckController.PATH.equals(request.getRequestURI())
				&& status == HttpServletResponse.SC_OK) {
			return Level.DEBUG;
		}
		return Level.INFO;
	}

}
