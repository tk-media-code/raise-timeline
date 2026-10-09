package com.tkmedia.raisetimeline.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class UpdateProfileRequestTest {

	private static final String DISPLAY_NAME_MESSAGE = "1〜50 文字で入力してください";
	private static final String BIO_TOO_LONG = "160 文字以内で入力してください";
	private static final String BIO_MISSING = "自己紹介の項目がありません";
	private static final String UNUSABLE = "使えない文字が含まれています";

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
		assertThat(violations(new UpdateProfileRequest("アリス", "こんにちは"))).isEmpty();
	}

	@ParameterizedTest(name = "[{index}] 表示名 {0}")
	@NullSource
	@ValueSource(strings = { "", "   ", "　" })
	@DisplayName("表示名が空・空白だけ・null なら「1〜50 文字…」の誤りになる")
	void blankDisplayNameIsRejected(String displayName) {
		assertThat(violations(new UpdateProfileRequest(displayName, ""))).containsEntry("displayName", DISPLAY_NAME_MESSAGE);
	}

	@Test
	@DisplayName("表示名は前後の空白を除く")
	void displayNameIsStripped() {
		assertThat(new UpdateProfileRequest(" アリス ", "").displayName()).isEqualTo("アリス");
	}

	@Test
	@DisplayName("表示名の文字数はコードポイントで数え、50 は通り 51 は誤りになる")
	void displayNameCountsCodePoints() {
		assertThat(violations(new UpdateProfileRequest("😀".repeat(50), ""))).isEmpty();
		assertThat(violations(new UpdateProfileRequest("😀".repeat(51), "")))
				.containsEntry("displayName", DISPLAY_NAME_MESSAGE);
	}

	@Test
	@DisplayName("表示名に NUL があれば使えない文字の誤りになる")
	void displayNameWithNulIsRejected() {
		assertThat(violations(new UpdateProfileRequest("a\u0000", ""))).containsEntry("displayName", UNUSABLE);
	}

	@Test
	@DisplayName("自己紹介は空文字でも通る")
	void emptyBioPasses() {
		assertThat(violations(new UpdateProfileRequest("アリス", ""))).isEmpty();
	}

	@Test
	@DisplayName("自己紹介の文字数はコードポイントで数え、160 は通り 161 は誤りになる")
	void bioCountsCodePoints() {
		assertThat(violations(new UpdateProfileRequest("アリス", "😀".repeat(160)))).isEmpty();
		assertThat(violations(new UpdateProfileRequest("アリス", "😀".repeat(161)))).containsEntry("bio", BIO_TOO_LONG);
	}

	@Test
	@DisplayName("自己紹介の CRLF は 1 文字と数えるので、159 文字と CRLF は通る")
	void bioCountsCrlfAsOne() {
		UpdateProfileRequest request = new UpdateProfileRequest("アリス", "あ".repeat(159) + "\r\n");

		assertThat(request.bio()).isEqualTo("あ".repeat(159) + "\n");
		assertThat(violations(request)).isEmpty();
	}

	@Test
	@DisplayName("自己紹介の CRLF は LF になる")
	void bioNewlinesAreNormalized() {
		assertThat(new UpdateProfileRequest("アリス", "a\r\nb").bio()).isEqualTo("a\nb");
	}

	@Test
	@DisplayName("空白と改行だけの自己紹介は空文字になる")
	void whitespaceOnlyBioBecomesEmpty() {
		assertThat(new UpdateProfileRequest("アリス", " \n　\t").bio()).isEmpty();
	}

	@Test
	@DisplayName("自己紹介の前後の空白は入力のまま残す")
	void bioKeepsSurroundingWhitespace() {
		assertThat(new UpdateProfileRequest("アリス", "  こんにちは  ").bio()).isEqualTo("  こんにちは  ");
	}

	@Test
	@DisplayName("自己紹介が null なら「自己紹介の項目がありません」の誤りになる")
	void nullBioIsRejected() {
		assertThat(violations(new UpdateProfileRequest("アリス", null))).containsEntry("bio", BIO_MISSING);
	}

	@Test
	@DisplayName("自己紹介に対になっていないサロゲートがあれば使えない文字の誤りになる")
	void bioWithLoneSurrogateIsRejected() {
		assertThat(violations(new UpdateProfileRequest("アリス", "\uD800"))).containsEntry("bio", UNUSABLE);
	}

	@Test
	@DisplayName("自己紹介に NUL があれば使えない文字の誤りになる")
	void bioWithNulIsRejected() {
		assertThat(violations(new UpdateProfileRequest("アリス", "a\u0000"))).containsEntry("bio", UNUSABLE);
	}

	private static Map<String, String> violations(UpdateProfileRequest request) {
		return validator.validate(request).stream().collect(Collectors.toMap(
				v -> v.getPropertyPath().toString(), ConstraintViolation::getMessage, (a, b) -> a));
	}

}
