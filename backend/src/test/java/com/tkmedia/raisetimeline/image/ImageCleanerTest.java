package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.logging.LogLines;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 後始末の失敗が、握りつぶされたうえで WARN の 1 行に残ることを確かめる。
 *
 * <p>行の形（JSON）まで確かめるため、Spring Boot のログの設定を効かせる {@code @SpringBootTest} で動かす。
 * 文脈に入れるのは {@link ImageCleaner} だけなので、DB には繋がない。
 */
@SpringBootTest(classes = ImageCleaner.class)
@ExtendWith(OutputCaptureExtension.class)
class ImageCleanerTest {

	@MockitoBean
	private ImageStorage storage;

	@Autowired
	private ImageCleaner cleaner;

	@Test
	@DisplayName("保存先が例外を投げても、deleteQuietly は例外を出さない")
	void swallowsStorageFailure() {
		List<String> keys = List.of("posts/a.jpg");
		doThrow(new IllegalStateException("S3 が落ちた")).when(storage).deleteAll(keys);

		assertThatCode(() -> cleaner.deleteQuietly(keys)).doesNotThrowAnyException();
	}

	@Test
	@DisplayName("失敗は WARN の image.delete_failed に、キーの配列と原因の例外つきで残る")
	void logsWarnWithKeysAndCause(CapturedOutput output) {
		List<String> keys = List.of("posts/a.jpg", "posts/b.png");
		doThrow(new IllegalStateException("S3 が落ちた")).when(storage).deleteAll(keys);

		cleaner.deleteQuietly(keys);

		List<Map<String, Object>> lines = LogLines.withAction(LogLines.parse(output), LogEvents.IMAGE_DELETE_FAILED);
		assertThat(lines).hasSize(1);
		Map<String, Object> line = lines.get(0);
		assertThat(LogLines.get(line, "log.level")).isEqualTo("WARN");
		assertThat(LogLines.get(line, LogFields.APP_IMAGE_KEYS)).isEqualTo(List.of("posts/a.jpg", "posts/b.png"));
		assertThat(LogLines.get(line, "error.message")).isEqualTo("S3 が落ちた");
		// ECS の JSON は event.action を入れ子（"event":{"action":...}）で出す。キーは文字列の配列のまま載る。
		assertThat(output.getOut()).contains("\"keys\":[\"posts/a.jpg\",\"posts/b.png\"]");
	}

	@Test
	@DisplayName("成功したときは保存先に全部渡し、WARN は出さない")
	void deletesAllKeysAtOnce(CapturedOutput output) {
		List<String> keys = List.of("posts/a.jpg", "posts/b.png");

		cleaner.deleteQuietly(keys);

		verify(storage).deleteAll(keys);
		assertThat(output.getOut()).doesNotContain(LogEvents.IMAGE_DELETE_FAILED);
	}

	@Test
	@DisplayName("空のリストでは保存先を呼ばない")
	void emptyListDoesNothing() {
		cleaner.deleteQuietly(List.of());

		verifyNoInteractions(storage);
	}

}
