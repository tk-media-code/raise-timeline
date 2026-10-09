package com.tkmedia.raisetimeline.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.apache.commons.imaging.Imaging;
import org.apache.commons.imaging.ImagingException;
import org.apache.commons.imaging.formats.jpeg.JpegImageMetadata;
import org.apache.commons.imaging.formats.tiff.TiffImageMetadata;
import org.apache.commons.imaging.formats.tiff.constants.ExifTagConstants;
import org.apache.commons.imaging.formats.tiff.constants.TiffDirectoryConstants;
import org.apache.commons.imaging.formats.tiff.constants.TiffTagConstants;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GpsMetadataRemoverTest {

	private static TiffImageMetadata exifOf(byte[] jpeg) {
		JpegImageMetadata metadata = TestImages.metadataOf(jpeg);
		return metadata == null ? null : metadata.getExif();
	}

	private static void assertDecodesWithSameSize(byte[] jpeg) throws IOException {
		BufferedImage image = ImageIO.read(new ByteArrayInputStream(jpeg));

		assertThat(image).isNotNull();
		assertThat(image.getWidth()).isEqualTo(TestImages.WIDTH);
		assertThat(image.getHeight()).isEqualTo(TestImages.HEIGHT);
	}

	@Test
	@DisplayName("前提: テスト用の JPEG には GPS が入っている")
	void fixtureHasGps() throws ImagingException {
		TiffImageMetadata exif = exifOf(TestImages.jpegWithGpsAndOrientation());

		assertThat(exif.findDirectory(TiffDirectoryConstants.DIRECTORY_TYPE_GPS)).isNotNull();
		assertThat(exif.getGpsInfo()).isNotNull();
		assertThat(exif.findField(ExifTagConstants.EXIF_TAG_GPSINFO)).isNotNull();
	}

	@Test
	@DisplayName("GPS のディレクトリと IFD0 の GPSInfo の指し先が消え、向きは残る")
	void removesGpsKeepsOrientation() throws Exception {
		byte[] stripped = GpsMetadataRemover.strip(TestImages.jpegWithGpsAndOrientation());

		TiffImageMetadata exif = exifOf(stripped);
		assertThat(exif.findDirectory(TiffDirectoryConstants.DIRECTORY_TYPE_GPS)).isNull();
		assertThat(exif.getGpsInfo()).isNull();
		assertThat(exif.findField(ExifTagConstants.EXIF_TAG_GPSINFO)).isNull();
		assertThat(exif.findField(TiffTagConstants.TIFF_TAG_ORIENTATION).getIntValue()).isEqualTo(6);
		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("XMP に GPS がある JPEG は、XMP が無くなる")
	void removesXmp() throws Exception {
		byte[] source = TestImages.jpegWithXmpGps();
		assertThat(Imaging.getXmpXml(source)).contains("GPSLatitude");

		byte[] stripped = GpsMetadataRemover.strip(source);

		assertThat(Imaging.getXmpXml(stripped)).isNull();
		assertThat(new String(stripped, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLatitude");
		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("Extended XMP に GPS がある JPEG は、その APP1 ごと無くなる")
	void removesExtendedXmp() throws Exception {
		byte[] source = TestImages.jpegWithExtendedXmpGps();
		assertThat(new String(source, StandardCharsets.ISO_8859_1)).contains("GPSLatitude");

		byte[] stripped = GpsMetadataRemover.strip(source);

		String text = new String(stripped, StandardCharsets.ISO_8859_1);
		assertThat(text).doesNotContain("GPSLatitude").doesNotContain("http://ns.adobe.com/xmp/extension/");
		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("GPS の中の文字列（GPSProcessingMethod）が、出力のバイト列から無くなる")
	void removesGpsTextFromBytes() throws Exception {
		String marker = "SECRET-GPS-MARKER-TOKYO";
		byte[] source = TestImages.jpegWithGpsMarker(marker);
		// 前提: 入力には文字列がそのまま入っている（入っていなければ、この検査は何も確かめない）。
		assertThat(new String(source, StandardCharsets.ISO_8859_1)).contains(marker);

		byte[] stripped = GpsMetadataRemover.strip(source);

		assertThat(new String(stripped, StandardCharsets.ISO_8859_1)).doesNotContain(marker);
		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("画素を符号化したデータ（SOS から EOI まで）は、取り除く前と 1 バイトも変わらない")
	void keepsScanDataByteIdentical() throws Exception {
		byte[] source = TestImages.jpegWithGpsMarker("SECRET-GPS-MARKER-TOKYO");

		byte[] stripped = GpsMetadataRemover.strip(source);

		// 恒等関数でも画素は変わらないので、メタデータが実際に変わっていること（前提）も合わせて確かめる。
		assertThat(stripped).isNotEqualTo(source);
		assertThat(exifOf(stripped).findDirectory(TiffDirectoryConstants.DIRECTORY_TYPE_GPS)).isNull();
		assertThat(TestImages.scanData(stripped)).isNotEmpty().isEqualTo(TestImages.scanData(source));
		assertThat(TestImages.scanData(source)).isEqualTo(TestImages.scanData(TestImages.jpeg()));
	}

	@Test
	@DisplayName("壊れた APP13 を持つ JPEG も通り、読み直せる（Exif 以外の壊れた部分では弾かない）")
	void passesJpegWithMalformedApp13() throws Exception {
		byte[] source = TestImages.jpegWithMalformedApp13();

		byte[] stripped = GpsMetadataRemover.strip(source);

		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("Exif の無い JPEG は通り、読み直せる")
	void passesJpegWithoutExif() throws Exception {
		byte[] stripped = GpsMetadataRemover.strip(TestImages.jpeg());

		assertThat(exifOf(stripped)).isNull();
		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("GPS の無い Exif 付きの JPEG は通り、向きが残る")
	void passesJpegWithExifWithoutGps() throws Exception {
		byte[] stripped = GpsMetadataRemover.strip(TestImages.jpegWithOrientationOnly());

		assertThat(exifOf(stripped).findField(TiffTagConstants.TIFF_TAG_ORIENTATION).getIntValue()).isEqualTo(6);
		assertDecodesWithSameSize(stripped);
	}

	@Test
	@DisplayName("中身が壊れた JPEG は読み取れない画像として弾く")
	void rejectsFakeJpeg() {
		assertThatThrownBy(() -> GpsMetadataRemover.strip(TestImages.fakeJpeg()))
				.isInstanceOf(UnreadableImageException.class);
	}

}
