package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.FileTooLargeException;
import com.tkmedia.raisetimeline.error.UnsupportedImageTypeException;
import com.tkmedia.raisetimeline.error.ValidationException;
import java.nio.charset.StandardCharsets;
import org.apache.commons.imaging.formats.tiff.constants.TiffDirectoryConstants;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ImageUploadRulesTest {

	private static final String UNREADABLE = "画像を読み取れませんでした";

	private static void assertUnreadable(byte[] content, String field) {
		assertThatThrownBy(() -> ImageUploadRules.prepare(field, content, ImageUploadRules.POST_MAX_BYTES))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).containsExactly(new FieldError(field, UNREADABLE)));
	}

	@Test
	@DisplayName("上限と枚数の定数は設計書の値になっている")
	void constants() {
		assertThat(ImageUploadRules.POST_MAX_BYTES).isEqualTo(5L * 1024 * 1024);
		assertThat(ImageUploadRules.AVATAR_MAX_BYTES).isEqualTo(2L * 1024 * 1024);
		assertThat(ImageUploadRules.POST_MAX_COUNT).isEqualTo(4);
	}

	@Test
	@DisplayName("空のファイルは、渡した項目名で 422 になる")
	void rejectsEmpty() {
		assertUnreadable(new byte[0], "images");
		assertUnreadable(new byte[0], "avatar");
	}

	@Test
	@DisplayName("投稿画像は 5,242,880 バイトまで通り、5,242,881 バイトは 413")
	void postSizeBoundary() {
		PreparedImage ok = ImageUploadRules.prepare("images", TestImages.pngOfSize(5_242_880L),
				ImageUploadRules.POST_MAX_BYTES);
		assertThat(ok.type()).isEqualTo(ImageType.PNG);

		assertThatThrownBy(() -> ImageUploadRules.prepare("images", TestImages.pngOfSize(5_242_881L),
				ImageUploadRules.POST_MAX_BYTES)).isInstanceOf(FileTooLargeException.class);
	}

	@Test
	@DisplayName("アイコンは 2,097,152 バイトまで通り、2,097,153 バイトは 413")
	void avatarSizeBoundary() {
		PreparedImage ok = ImageUploadRules.prepare("avatar", TestImages.pngOfSize(2_097_152L),
				ImageUploadRules.AVATAR_MAX_BYTES);
		assertThat(ok.type()).isEqualTo(ImageType.PNG);

		assertThatThrownBy(() -> ImageUploadRules.prepare("avatar", TestImages.pngOfSize(2_097_153L),
				ImageUploadRules.AVATAR_MAX_BYTES)).isInstanceOf(FileTooLargeException.class);
	}

	@Test
	@DisplayName("SVG・テキスト・拡張子を偽ったテキストは 415")
	void rejectsUnsupportedTypes() {
		assertThatThrownBy(() -> ImageUploadRules.prepare("images", TestImages.svg(), ImageUploadRules.POST_MAX_BYTES))
				.isInstanceOf(UnsupportedImageTypeException.class);
		assertThatThrownBy(() -> ImageUploadRules.prepare("images", TestImages.text(), ImageUploadRules.POST_MAX_BYTES))
				.isInstanceOf(UnsupportedImageTypeException.class);
		// ファイル名が photo.jpg でも、サーバーは名前を見ない。中身が文字なら形式の検査で弾かれる。
		byte[] textNamedJpg = "photo.jpg の中身はただの文字".getBytes(StandardCharsets.UTF_8);
		assertThatThrownBy(() -> ImageUploadRules.prepare("images", textNamedJpg, ImageUploadRules.POST_MAX_BYTES))
				.isInstanceOf(UnsupportedImageTypeException.class);
	}

	@Test
	@DisplayName("PNG・GIF・WebP は中身をそのまま返す")
	void returnsNonJpegAsIs() {
		byte[] png = TestImages.png();
		byte[] gif = TestImages.gif();
		byte[] webp = TestImages.webp();

		PreparedImage preparedPng = ImageUploadRules.prepare("images", png, ImageUploadRules.POST_MAX_BYTES);
		PreparedImage preparedGif = ImageUploadRules.prepare("images", gif, ImageUploadRules.POST_MAX_BYTES);
		PreparedImage preparedWebp = ImageUploadRules.prepare("images", webp, ImageUploadRules.POST_MAX_BYTES);

		assertThat(preparedPng.content()).isEqualTo(png);
		assertThat(preparedPng.type()).isEqualTo(ImageType.PNG);
		assertThat(preparedGif.content()).isEqualTo(gif);
		assertThat(preparedGif.type()).isEqualTo(ImageType.GIF);
		assertThat(preparedWebp.content()).isEqualTo(webp);
		assertThat(preparedWebp.type()).isEqualTo(ImageType.WEBP);
	}

	@Test
	@DisplayName("JPEG は GPS が消えた中身を返す")
	void stripsGpsFromJpeg() throws Exception {
		PreparedImage prepared = ImageUploadRules.prepare("images", TestImages.jpegWithGpsAndOrientation(),
				ImageUploadRules.POST_MAX_BYTES);

		assertThat(prepared.type()).isEqualTo(ImageType.JPEG);
		assertThat(TestImages.metadataOf(prepared.content()).getExif()
				.findDirectory(TiffDirectoryConstants.DIRECTORY_TYPE_GPS)).isNull();
	}

	@Test
	@DisplayName("読み取れない JPEG は 422")
	void rejectsFakeJpeg() {
		assertUnreadable(TestImages.fakeJpeg(), "images");
	}

	@Test
	@DisplayName("大きさの検査は形式の検査より先。6 MB の SVG は 413")
	void sizeCheckComesBeforeTypeCheck() {
		byte[] bigSvg = new byte[6 * 1024 * 1024];
		byte[] svg = TestImages.svg();
		System.arraycopy(svg, 0, bigSvg, 0, svg.length);

		assertThatThrownBy(() -> ImageUploadRules.prepare("images", bigSvg, ImageUploadRules.POST_MAX_BYTES))
				.isInstanceOf(FileTooLargeException.class);
	}

}
