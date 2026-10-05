package com.tkmedia.raisetimeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
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

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private Flyway flyway;

	@Test
	@DisplayName("アプリ全体が起動し、本物の DB に届いた状態で GET / が 200 を返す")
	void rootReturnsOkWithRealDatabase() throws Exception {
		mockMvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.database").value("UP"));
	}

	@Test
	@DisplayName("起動時に Flyway が走り、本物の DB に flyway_schema_history がある")
	void flywayCreatesSchemaHistoryOnStartup() {
		// テーブルは開発用アプリの起動で先に作られていることがあるので、Flyway がこの起動に含まれることは Bean で確かめる。
		assertThat(flyway).isNotNull();
		// to_regclass は、テーブルが無ければ例外ではなく NULL を返す。
		String table = jdbcTemplate.queryForObject(
				"SELECT to_regclass('flyway_schema_history')::text", String.class);
		assertThat(table).isEqualTo("flyway_schema_history");
	}

}
