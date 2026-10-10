package com.tkmedia.raisetimeline.image;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * 統合テストで、本物の保存先の代わりに {@link InMemoryImageStorage} を使う設定。
 *
 * <p>{@code @Import(InMemoryImageStorageConfig.class)} で取り込む。{@code @Primary} なので、
 * 本体の {@code DisabledImageStorage} や {@code S3ImageStorage} と並んでも、こちらが選ばれる。
 */
@TestConfiguration(proxyBeanMethods = false)
public class InMemoryImageStorageConfig {

	@Bean
	@Primary
	public InMemoryImageStorage inMemoryImageStorage() {
		return new InMemoryImageStorage();
	}

}
