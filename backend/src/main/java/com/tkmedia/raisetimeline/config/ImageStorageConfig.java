package com.tkmedia.raisetimeline.config;

import com.tkmedia.raisetimeline.image.DisabledImageStorage;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.S3ImageStorage;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.awscore.retry.AwsRetryStrategy;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * 画像の保存先を、設定で選ぶ。バケットの設定があれば S3、無ければ使えない代わり（503 になる）。
 *
 * <p>設定が無くてもアプリを起動できるようにするため。条件の「バケットが無い」は、
 * {@link ImageStorageProperties} の検査と同じく、空白だけも含める。
 */
@Configuration
@EnableConfigurationProperties(ImageStorageProperties.class)
public class ImageStorageConfig {

	/** 1 回の呼び出し（再試行を含む）の上限。S3 が固まっても、利用者の要求をいつまでも待たせない。 */
	private static final Duration API_CALL_TIMEOUT = Duration.ofSeconds(30);

	/** 初回 + 再試行 2 回。 */
	private static final int MAX_ATTEMPTS = 3;

	@Bean
	@ConditionalOnExpression("!'${image-storage.bucket:}'.isBlank()")
	public S3Client s3Client(ImageStorageProperties properties) {
		// 認証情報は渡さない。SDK の標準の探索順（環境変数 → … → インスタンスロール）が、ローカルと本番で働く。
		return S3Client.builder()
				.region(Region.of(properties.region()))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.apiCallTimeout(API_CALL_TIMEOUT)
						.retryStrategy(AwsRetryStrategy.standardRetryStrategy().toBuilder()
								.maxAttempts(MAX_ATTEMPTS)
								.build())
						.build())
				.build();
	}

	@Bean
	@ConditionalOnExpression("!'${image-storage.bucket:}'.isBlank()")
	public ImageStorage s3ImageStorage(S3Client client, ImageStorageProperties properties) {
		return new S3ImageStorage(client, properties.bucket(), properties.publicBaseUrl());
	}

	@Bean
	@ConditionalOnExpression("'${image-storage.bucket:}'.isBlank()")
	public ImageStorage disabledImageStorage() {
		return new DisabledImageStorage();
	}

}
