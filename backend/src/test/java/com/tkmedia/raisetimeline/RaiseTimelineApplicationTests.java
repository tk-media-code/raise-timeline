package com.tkmedia.raisetimeline;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/**
 * アプリ全体を起動して確かめるテスト。
 *
 * <p><strong>本物の DB が要る。</strong>DB の接続情報（{@code DB_URL} などの環境変数）が無い環境では
 * 失敗するので、docker compose で起動した backend コンテナの中で実行する。
 */
@SpringBootTest
@AutoConfigureMockMvc
class RaiseTimelineApplicationTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	@DisplayName("アプリ全体が起動し、本物の DB に届いた状態で GET / が 200 を返す")
	void rootReturnsOkWithRealDatabase() throws Exception {
		mockMvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.database").value("UP"));
	}

}
