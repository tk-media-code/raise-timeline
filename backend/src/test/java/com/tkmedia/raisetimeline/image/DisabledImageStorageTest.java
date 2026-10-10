package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DisabledImageStorageTest {

	private final DisabledImageStorage storage = new DisabledImageStorage();

	@Test
	@DisplayName("使えない保存先として名乗る")
	void isNotAvailable() {
		assertThat(storage.isAvailable()).isFalse();
	}

	@Test
	@DisplayName("保存は 503 になる例外を投げる")
	void putThrowsUnavailable() {
		assertThatThrownBy(() -> storage.put("posts/a.png", new byte[] { 1 }, "image/png"))
				.isInstanceOf(ImageStorageUnavailableException.class);
	}

	@Test
	@DisplayName("削除は 503 になる例外を投げる")
	void deleteAllThrowsUnavailable() {
		assertThatThrownBy(() -> storage.deleteAll(List.of("posts/a.png")))
				.isInstanceOf(ImageStorageUnavailableException.class);
	}

	@Test
	@DisplayName("URL は作れないので null を返す")
	void urlOfIsNull() {
		assertThat(storage.urlOf("posts/a.png")).isNull();
	}

}
