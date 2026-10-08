package com.tkmedia.raisetimeline.error;

import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 想定外の例外で 500 を返すときの ERROR を書く。
 *
 * <p>例外ハンドラ（MVC の中）とフィルタ（MVC の外）の両方から呼ぶので、1 か所にまとめる。
 * 500 1 件につき 1 行だけ書くため、呼ぶ側は「応答を作る場所」で 1 回だけ呼ぶ。
 */
public final class InternalErrorLog {

	private static final Logger log = LoggerFactory.getLogger(InternalErrorLog.class);

	private InternalErrorLog() {
	}

	public static void write(Exception cause) {
		// 例外の種類・文言・スタックトレースは setCause が error.* に出す。本文には載せない。
		log.atError()
				.addKeyValue(LogFields.EVENT_ACTION, LogEvents.HTTP_REQUEST_FAILED)
				.addKeyValue(LogFields.EVENT_CODE, ErrorCode.INTERNAL_ERROR.name())
				.setCause(cause)
				.log("想定外の例外で 500 を返した");
	}

}
