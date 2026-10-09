package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.tkmedia.raisetimeline.image.DisabledImageStorage;
import com.tkmedia.raisetimeline.image.ImageStorage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 自動テストが本物の S3 に触れないことの確認。
 *
 * <p>テストは開発用のアプリと同じコンテナで走り、{@code .env} の S3 の設定が環境変数として見える。
 * {@code application-test.properties} がそれを打ち消さないと、テストが開発用バケットに書いてしまう。
 * ここでは環境変数の代わりに {@code S3_BUCKET} を渡して、それでも使われないことを確かめる。
 */
@SpringBootTest(properties = "S3_BUCKET=real-bucket")
@ActiveProfiles("test")
class ImageStorageTestProfileTest {

	@Autowired
	private ImageStorage imageStorage;

	@Test
	@DisplayName("S3_BUCKET が渡っていても、テストのプロファイルでは DisabledImageStorage のまま")
	void testProfileNeverUsesRealS3() {
		assertThat(imageStorage).isInstanceOf(DisabledImageStorage.class);
	}

}
