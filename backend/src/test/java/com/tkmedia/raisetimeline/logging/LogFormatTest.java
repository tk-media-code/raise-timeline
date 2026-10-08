package com.tkmedia.raisetimeline.logging;

import static org.assertj.core.api.Assertions.assertThat;

import com.tkmedia.raisetimeline.controller.HealthCheckController;
import com.tkmedia.raisetimeline.mapper.HealthCheckMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 予定している全項目を載せた 1 行が、JSON として読めることを確かめる（logging-design.md の 4 章・12 章の 6）。
 *
 * <p>要求は送らない。Spring Boot が初期化したログの設定で 1 行を書き、標準出力から読み戻す。
 * 項目名の衝突（MDC と行の項目の重複、{@code error} などの下への自前の項目）は行を壊すので、その検知を兼ねる。
 */
@WebMvcTest(HealthCheckController.class)
@ExtendWith(OutputCaptureExtension.class)
class LogFormatTest {

	private static final Logger log = LoggerFactory.getLogger(LogFormatTest.class);

	// WebMvcTest の文脈を作るために要る。この中身は使わない。
	@MockitoBean
	private HealthCheckMapper healthCheckMapper;

	@Test
	@DisplayName("予定している全項目を載せた 1 行が、入れ子の JSON として読める")
	void allPlannedFieldsFormOneJsonLine(CapturedOutput output) {
		MDC.put("http.request.id", "req-1");
		MDC.put("client.ip", "203.0.113.5");
		MDC.put("user.id", "0199b000-0000-7000-8000-000000000001");
		try {
			log.atWarn()
					.addKeyValue("http.request.method", "GET")
					.addKeyValue("url.path", "/api/posts")
					.addKeyValue("url.query", "limit=20")
					.addKeyValue("http.response.status_code", 500)
					.addKeyValue("event.duration", 1234L)
					.addKeyValue("event.action", "http.request")
					.addKeyValue("event.code", "INTERNAL_ERROR")
					.addKeyValue("app.post.id", "p1")
					.addKeyValue("app.comment.id", "c1")
					.addKeyValue("app.image.keys", List.of("posts/a.jpg", "posts/b.png"))
					.setCause(new IllegalStateException("cause-1"))
					.log("全項目の確認");
			log.info("次の行");
		} finally {
			MDC.clear();
		}

		List<Map<String, Object>> lines = LogLines.parse(output);
		List<Map<String, Object>> targets = lines.stream()
				.filter(line -> "全項目の確認".equals(line.get("message")))
				.toList();
		assertThat(targets).hasSize(1);
		Map<String, Object> line = targets.get(0);

		assertThat(LogLines.get(line, "http.request.id")).isEqualTo("req-1");
		assertThat(LogLines.get(line, "client.ip")).isEqualTo("203.0.113.5");
		assertThat(LogLines.get(line, "user.id")).isEqualTo("0199b000-0000-7000-8000-000000000001");
		assertThat(LogLines.get(line, "http.request.method")).isEqualTo("GET");
		assertThat(LogLines.get(line, "url.path")).isEqualTo("/api/posts");
		assertThat(LogLines.get(line, "url.query")).isEqualTo("limit=20");
		assertThat(LogLines.get(line, "http.response.status_code")).isEqualTo(500);
		assertThat(((Number) LogLines.get(line, "event.duration")).longValue()).isEqualTo(1234L);
		assertThat(LogLines.get(line, "event.action")).isEqualTo("http.request");
		assertThat(LogLines.get(line, "event.code")).isEqualTo("INTERNAL_ERROR");
		assertThat(LogLines.get(line, "app.post.id")).isEqualTo("p1");
		assertThat(LogLines.get(line, "app.comment.id")).isEqualTo("c1");
		assertThat(LogLines.get(line, "app.image.keys")).isEqualTo(List.of("posts/a.jpg", "posts/b.png"));

		assertThat(LogLines.get(line, "log.level")).isEqualTo("WARN");
		assertThat(LogLines.get(line, "error.type")).isEqualTo("java.lang.IllegalStateException");
		assertThat((String) LogLines.get(line, "error.stack_trace")).contains("cause-1");
		assertThat(LogLines.get(line, "service.name")).isEqualTo("raise-timeline");
		assertThat(LogLines.get(line, "service.environment")).isEqualTo("local");
		assertThat(LogLines.get(line, "ecs.version")).isNotNull();

		// 行が壊れていれば、次の行がつながって読めなくなる。
		assertThat(lines).anyMatch(next -> "次の行".equals(next.get("message")));
	}

}
