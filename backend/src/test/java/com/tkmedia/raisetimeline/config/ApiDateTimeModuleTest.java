package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;

/**
 * Spring が組み立てた {@link JsonMapper} に {@link ApiDateTimeModule} が入っていて、
 * API の日時が「UTC・秒まで」で書き出されることを確かめる。
 */
@SpringBootTest
@ActiveProfiles("test")
class ApiDateTimeModuleTest {

	@Autowired
	private JsonMapper jsonMapper;

	@ParameterizedTest(name = "[{index}] {0} は {1} になる")
	@CsvSource({
			"2026-10-09T07:36:14.740623Z, 2026-10-09T07:36:14Z",
			"2026-10-09T16:36:14.999999999+09:00, 2026-10-09T07:36:14Z",
			"2026-10-09T07:36:00Z, 2026-10-09T07:36:00Z"
	})
	@DisplayName("日時は UTC に直し、小数秒を切り捨てて、秒が 0 でも省かずに書き出す")
	void writesUtcSecondsOnly(String input, String expected) {
		String json = jsonMapper.writeValueAsString(OffsetDateTime.parse(input));

		assertThat(json).isEqualTo("\"" + expected + "\"");
	}

}
