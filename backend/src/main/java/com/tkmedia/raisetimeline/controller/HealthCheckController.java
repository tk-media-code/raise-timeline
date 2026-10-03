package com.tkmedia.raisetimeline.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthCheckController {

	private static final Logger log = LoggerFactory.getLogger(HealthCheckController.class);

	private final JdbcTemplate jdbcTemplate;

	public HealthCheckController(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	@GetMapping("/")
	public ResponseEntity<HealthCheckResponse> check() {
		try {
			jdbcTemplate.queryForObject("SELECT 1", Integer.class);
			return ResponseEntity.ok(new HealthCheckResponse("UP", "UP"));
		} catch (DataAccessException e) {
			// 例外の文言には接続先などが入り得るので、ログにだけ残し、レスポンスには載せない。
			log.warn("DB への問い合わせに失敗した", e);
			return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
					.body(new HealthCheckResponse("DOWN", "DOWN"));
		}
	}

	public record HealthCheckResponse(String status, String database) {
	}

}
