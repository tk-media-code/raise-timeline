package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ImageKeysTest {

	@Test
	@DisplayName("投稿画像のキーは posts/<UUID>.<拡張子> になる")
	void postKey() {
		assertThat(ImageKeys.post(ImageType.PNG)).matches("^posts/[0-9a-f-]{36}\\.png$");
	}

	@Test
	@DisplayName("アイコンのキーは avatars/<ユーザー id>/<UUID>.<拡張子> になる")
	void avatarKey() {
		UUID userId = UUID.randomUUID();

		assertThat(ImageKeys.avatar(userId, ImageType.JPEG))
				.matches("^avatars/" + userId + "/[0-9a-f-]{36}\\.jpg$");
	}

	@Test
	@DisplayName("拡張子は形式から付ける")
	void extensionFollowsType() {
		assertThat(ImageKeys.post(ImageType.GIF)).endsWith(".gif");
		assertThat(ImageKeys.post(ImageType.WEBP)).endsWith(".webp");
	}

	@Test
	@DisplayName("同じ条件で 2 回呼ぶと違うキーになる")
	void keysAreUnique() {
		assertThat(ImageKeys.post(ImageType.PNG)).isNotEqualTo(ImageKeys.post(ImageType.PNG));

		UUID userId = UUID.randomUUID();
		assertThat(ImageKeys.avatar(userId, ImageType.PNG)).isNotEqualTo(ImageKeys.avatar(userId, ImageType.PNG));
	}

}
