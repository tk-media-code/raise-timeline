package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;

class ConstraintViolationsTest {

	@Test
	@DisplayName("最も深い原因のメッセージに制約の名前があれば true")
	void matchesNameInMostSpecificCause() {
		DataIntegrityViolationException e = new DataIntegrityViolationException("outer", new RuntimeException("mid",
				new SQLException("violates foreign key constraint \"comments_post_id_fkey\"")));

		assertThat(ConstraintViolations.violates(e, "comments_post_id_fkey")).isTrue();
	}

	@Test
	@DisplayName("DuplicateKeyException（サブクラス）でも見分けられる")
	void worksForDuplicateKeyException() {
		DuplicateKeyException e = new DuplicateKeyException("x",
				new SQLException("duplicate key value violates unique constraint \"users_username_key\""));

		assertThat(ConstraintViolations.violates(e, "users_username_key")).isTrue();
	}

	@Test
	@DisplayName("メッセージが null なら false")
	void nullMessageIsFalse() {
		DataIntegrityViolationException e = new DataIntegrityViolationException("outer", new SQLException((String) null));

		assertThat(ConstraintViolations.violates(e, "comments_post_id_fkey")).isFalse();
	}

	@Test
	@DisplayName("別の制約の名前なら false")
	void differentNameIsFalse() {
		DataIntegrityViolationException e = new DataIntegrityViolationException("x",
				new SQLException("violates foreign key constraint \"comments_user_id_fkey\""));

		assertThat(ConstraintViolations.violates(e, "comments_post_id_fkey")).isFalse();
	}

}
