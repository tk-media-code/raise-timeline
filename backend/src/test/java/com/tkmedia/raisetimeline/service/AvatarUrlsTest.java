package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.image.ImageStorage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AvatarUrlsTest {

	private final ImageStorage imageStorage = mock(ImageStorage.class);

	@Test
	@DisplayName("キーが null なら null で、urlOf を呼ばない")
	void nullKeyIsNullWithoutCallingUrlOf() {
		assertThat(AvatarUrls.of(imageStorage, null)).isNull();

		verifyNoInteractions(imageStorage);
	}

	@Test
	@DisplayName("キーがあれば、urlOf の結果を返す")
	void keyGivesUrlOfResult() {
		when(imageStorage.urlOf("avatars/a.png")).thenReturn("https://images.test/avatars/a.png");

		assertThat(AvatarUrls.of(imageStorage, "avatars/a.png")).isEqualTo("https://images.test/avatars/a.png");
	}

}
