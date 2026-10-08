package com.tkmedia.raisetimeline.config;

import com.tkmedia.raisetimeline.error.ProblemDetailWriter;
import com.tkmedia.raisetimeline.web.RequestLogFilter;
import java.time.Clock;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LoggingConfig {

	/**
	 * 要求ログのフィルタを、順番とパターンを指定して登録する。
	 *
	 * <p>フィルタ自体は {@code @Bean} にしない。{@code Filter} 型の Bean は Spring Boot が自動で
	 * サーブレットのフィルタとして登録するので、{@code FilterRegistrationBean} と合わせて 2 回登録され、
	 * 要求ログが 1 要求につき 2 行出てしまう。ここでは {@code new} して登録情報の中に持たせる。
	 */
	@Bean
	public FilterRegistrationBean<RequestLogFilter> requestLogFilter(Clock clock, ProblemDetailWriter writer) {
		FilterRegistrationBean<RequestLogFilter> registration = new FilterRegistrationBean<>(new RequestLogFilter(clock, writer));
		registration.setOrder(RequestLogFilter.ORDER);
		registration.addUrlPatterns("/*");
		return registration;
	}

}
