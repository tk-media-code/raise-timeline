package com.tkmedia.raisetimeline.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {

	/**
	 * 時刻を読むものは、{@code Instant.now()} を直接呼ばずにこの Clock を受け取る。
	 * テストで Clock を差し替えれば、所要時間や有効期限のような時刻に依る振る舞いを固定して確かめられる。
	 * UTC にしているのは、ログも DB も UTC で揃えるため。
	 */
	@Bean
	public Clock clock() {
		return Clock.systemUTC();
	}

}
