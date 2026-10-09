package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ImageStoragePropertiesTest {

	@ParameterizedTest(name = "[{index}] 基点が未設定や空なら、バケットがあっても起動を止める")
	@DisplayName("bucket があるのに publicBaseUrl が null・空・空白だけなら起動に失敗する")
	@NullAndEmptySource
	@ValueSource(strings = { "   " })
	void bucketWithoutBaseUrlIsRejected(String baseUrl) {
		assertThatThrownBy(() -> new ImageStorageProperties("my-bucket", baseUrl, "ap-northeast-1"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessage("環境変数 S3_PUBLIC_BASE_URL が未設定です");
	}

	@Test
	@DisplayName("bucket と publicBaseUrl の両方が空なら通る（画像の機能を使わない環境）")
	void bothBlankIsAccepted() {
		assertThatCode(() -> new ImageStorageProperties("", "", "ap-northeast-1")).doesNotThrowAnyException();
		assertThatCode(() -> new ImageStorageProperties(null, null, "ap-northeast-1")).doesNotThrowAnyException();
	}

	@Test
	@DisplayName("bucket が空なら、publicBaseUrl だけあっても通る")
	void baseUrlWithoutBucketIsAccepted() {
		assertThatCode(() -> new ImageStorageProperties("", "https://b.example", "ap-northeast-1"))
				.doesNotThrowAnyException();
	}

	@Test
	@DisplayName("両方あれば通る")
	void bothPresentIsAccepted() {
		assertThatCode(() -> new ImageStorageProperties("b", "https://b.example", "ap-northeast-1"))
				.doesNotThrowAnyException();
	}

}
