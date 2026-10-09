package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ImageTypeDetectorTest {

	@Test
	@DisplayName("JPEG・PNG・GIF・WebP を先頭のバイトで判定する")
	void detectsSupportedTypes() {
		assertThat(ImageTypeDetector.detect(TestImages.jpeg())).contains(ImageType.JPEG);
		assertThat(ImageTypeDetector.detect(TestImages.png())).contains(ImageType.PNG);
		assertThat(ImageTypeDetector.detect(TestImages.gif())).contains(ImageType.GIF);
		assertThat(ImageTypeDetector.detect(TestImages.webp())).contains(ImageType.WEBP);
	}

	@Test
	@DisplayName("GIF87a も GIF と判定する")
	void detectsGif87a() {
		byte[] gif87a = "GIF87a\u0001\u0002".getBytes(StandardCharsets.ISO_8859_1);

		assertThat(ImageTypeDetector.detect(gif87a)).contains(ImageType.GIF);
	}

	@Test
	@DisplayName("SVG とテキストは判定できない")
	void rejectsSvgAndText() {
		assertThat(ImageTypeDetector.detect(TestImages.svg())).isEmpty();
		assertThat(ImageTypeDetector.detect(TestImages.text())).isEmpty();
	}

	@Test
	@DisplayName("空の配列は判定できない")
	void rejectsEmpty() {
		assertThat(ImageTypeDetector.detect(new byte[0])).isEqualTo(Optional.empty());
	}

	@Test
	@DisplayName("RIFF で始まっても WAVE は WebP ではない")
	void rejectsRiffWave() {
		byte[] wave = "RIFF\u0000\u0000\u0000\u0000WAVEfmt ".getBytes(StandardCharsets.ISO_8859_1);

		assertThat(ImageTypeDetector.detect(wave)).isEmpty();
	}

	@Test
	@DisplayName("先頭が足りない短いデータは判定できない")
	void rejectsTruncatedHeads() {
		assertThat(ImageTypeDetector.detect("GIF".getBytes(StandardCharsets.US_ASCII))).isEmpty();
		assertThat(ImageTypeDetector.detect(new byte[] {(byte) 0xFF, (byte) 0xD8})).isEmpty();
		assertThat(ImageTypeDetector.detect("RIFF\u0000\u0000\u0000\u0000WEB".getBytes(StandardCharsets.ISO_8859_1)))
				.isEmpty();
	}

	@Test
	@DisplayName("拡張子ではなく中身で判定する。JPEG の中身に PNG の先頭は混ざらない")
	void usesContentNotName() {
		assertThat(ImageTypeDetector.detect(TestImages.pngOfSize(16))).contains(ImageType.PNG);
	}

}
