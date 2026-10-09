package com.tkmedia.raisetimeline.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.tkmedia.raisetimeline.image.DisabledImageStorage;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.S3ImageStorage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ImageStorageConfigTest {

	/** S3Client は作るだけでネットワークには出ない（認証情報の解決は、最初の呼び出しまで遅れる）。 */
	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(ImageStorageConfig.class);

	@Test
	@DisplayName("bucket が空なら DisabledImageStorage になる")
	void blankBucketUsesDisabledStorage() {
		runner.withPropertyValues("image-storage.bucket=", "image-storage.public-base-url=",
				"image-storage.region=ap-northeast-1")
				.run(context -> {
					assertThat(context).hasSingleBean(ImageStorage.class);
					assertThat(context.getBean(ImageStorage.class)).isInstanceOf(DisabledImageStorage.class);
				});
	}

	@Test
	@DisplayName("bucket と基点があれば S3ImageStorage になる")
	void bucketAndBaseUrlUseS3Storage() {
		runner.withPropertyValues("image-storage.bucket=my-bucket",
				"image-storage.public-base-url=https://my-bucket.s3.ap-northeast-1.amazonaws.com",
				"image-storage.region=ap-northeast-1")
				.run(context -> {
					assertThat(context).hasNotFailed();
					ImageStorage storage = context.getBean(ImageStorage.class);
					assertThat(storage).isInstanceOf(S3ImageStorage.class);
					assertThat(storage.urlOf("posts/x.png"))
							.isEqualTo("https://my-bucket.s3.ap-northeast-1.amazonaws.com/posts/x.png");
				});
	}

	@Test
	@DisplayName("bucket があるのに基点が空なら、起動に失敗する")
	void bucketWithoutBaseUrlFailsStartup() {
		runner.withPropertyValues("image-storage.bucket=my-bucket", "image-storage.public-base-url=",
				"image-storage.region=ap-northeast-1")
				.run(context -> assertThat(context).hasFailed());
	}

}
