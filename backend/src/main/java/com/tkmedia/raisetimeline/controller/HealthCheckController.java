package com.tkmedia.raisetimeline.controller;

import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.mapper.HealthCheckMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthCheckController {

	/** nginx は /api/ だけを backend へ転送するので、ヘルスチェックもその下に置く。 */
	public static final String PATH = "/api/health";

	private static final Logger log = LoggerFactory.getLogger(HealthCheckController.class);

	private final HealthCheckMapper healthCheckMapper;

	public HealthCheckController(HealthCheckMapper healthCheckMapper) {
		this.healthCheckMapper = healthCheckMapper;
	}

	@GetMapping(PATH)
	public ResponseEntity<HealthCheckResponse> check() {
		try {
			healthCheckMapper.ping();
			return ResponseEntity.ok(new HealthCheckResponse("UP", "UP"));
		} catch (DataAccessException e) {
			// SQL の実行で起きた例外は、MyBatis-Spring が DataAccessException に変換して投げてくる。
			// Mapper の定義の誤りによる BindingException は変換されず 500 になる。
			// 設定の誤りは DB の停止と区別したいので、それでよい。
			// 例外の文言には接続先などが入り得るので、ログにだけ残し、レスポンスには載せない。
			log.atWarn()
					.addKeyValue(LogFields.EVENT_ACTION, LogEvents.HEALTH_DB_UNREACHABLE)
					.setCause(e)
					.log("DB への問い合わせに失敗した");
			return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
					.body(new HealthCheckResponse("DOWN", "DOWN"));
		}
	}

	public record HealthCheckResponse(String status, String database) {
	}

}
