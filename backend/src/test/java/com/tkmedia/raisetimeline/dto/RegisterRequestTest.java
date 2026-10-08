package com.tkmedia.raisetimeline.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RegisterRequestTest {

	private static ValidatorFactory factory;
	private static Validator validator;

	@BeforeAll
	static void setUp() {
		factory = Validation.buildDefaultValidatorFactory();
		validator = factory.getValidator();
	}

	@AfterAll
	static void tearDown() {
		factory.close();
	}

	@Test
	@DisplayName("正しい入力は検証を通る")
	void validRequestPasses() {
		assertThat(violations(new RegisterRequest("alice_01", "アリス", "alice@example.com", "password123"))).isEmpty();
	}

	@Test
	@DisplayName("displayName は前後の空白を除き、空白だけなら必須の誤りになる")
	void displayNameIsStrippedBeforeValidation() {
		assertThat(new RegisterRequest("alice", "  アリス　", "a@example.com", "password123").displayName())
				.isEqualTo("アリス");
		assertThat(violations(new RegisterRequest("alice", "   ", "a@example.com", "password123")))
				.containsEntry("displayName", "1〜50 文字で入力してください");
	}

	@Test
	@DisplayName("displayName の文字数は UTF-16 ではなくコードポイントで数える")
	void displayNameCountsCodePoints() {
		// 絵文字 1 文字は UTF-16 で 2 単位。50 個並べても 50 文字として通す。
		String fifty = "😀".repeat(50);
		String fiftyOne = "😀".repeat(51);

		assertThat(violations(new RegisterRequest("alice", fifty, "a@example.com", "password123"))).isEmpty();
		assertThat(violations(new RegisterRequest("alice", fiftyOne, "a@example.com", "password123")))
				.containsEntry("displayName", "1〜50 文字で入力してください");
	}

	@Test
	@DisplayName("各項目は、その項目の文言で誤りになる")
	void eachFieldHasItsOwnMessage() {
		Map<String, String> v = violations(new RegisterRequest("a!", "アリス", "not-an-email", "short"));

		assertThat(v).containsEntry("username", "3〜20 文字の英数字と _ で入力してください")
				.containsEntry("email", "メールアドレスの形式で入力してください")
				.containsEntry("password", "8〜72 文字の半角英数字と記号で入力してください");
	}

	@Test
	@DisplayName("空の項目も、既定の文言ではなくその項目の文言になる")
	void blankFieldsUseOwnMessages() {
		Map<String, String> v = violations(new RegisterRequest(null, null, null, null));

		assertThat(v).containsEntry("username", "3〜20 文字の英数字と _ で入力してください")
				.containsEntry("displayName", "1〜50 文字で入力してください")
				.containsEntry("email", "メールアドレスの形式で入力してください")
				.containsEntry("password", "8〜72 文字の半角英数字と記号で入力してください");
	}

	@Test
	@DisplayName("NUL 文字を含む項目は、使えない文字の誤りになる")
	void nulCharacterIsRejected() {
		Map<String, String> v = violations(new RegisterRequest("alice", "ア\u0000リス", "a@example.com", "password123"));

		assertThat(v).containsEntry("displayName", "使えない文字が含まれています");
	}

	@Test
	@DisplayName("ログインの項目は、空なら「入力してください」、NUL は使えない文字の誤りになる")
	void loginRequestMessages() {
		Set<ConstraintViolation<LoginRequest>> blank = validator.validate(new LoginRequest("", " "));
		assertThat(blank).extracting(ConstraintViolation::getMessage).containsOnly("入力してください");

		Set<ConstraintViolation<LoginRequest>> nul = validator.validate(new LoginRequest("a@example.com", "pa\u0000ss"));
		assertThat(nul).extracting(ConstraintViolation::getMessage).containsExactly("使えない文字が含まれています");
	}

	private static Map<String, String> violations(RegisterRequest request) {
		return validator.validate(request).stream().collect(Collectors.toMap(
				v -> v.getPropertyPath().toString(), ConstraintViolation::getMessage, (a, b) -> a));
	}

}
