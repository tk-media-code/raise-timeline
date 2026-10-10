package com.tkmedia.raisetimeline.image;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.apache.commons.imaging.Imaging;
import org.apache.commons.imaging.formats.jpeg.JpegImageMetadata;
import org.apache.commons.imaging.formats.jpeg.exif.ExifRewriter;
import org.apache.commons.imaging.formats.jpeg.xmp.JpegXmpRewriter;
import org.apache.commons.imaging.formats.tiff.constants.GpsTagConstants;
import org.apache.commons.imaging.formats.tiff.constants.TiffTagConstants;
import org.apache.commons.imaging.formats.tiff.write.TiffOutputSet;

/**
 * テストで使う画像のバイト列。作り方は docs/test-strategy.md 7 章に従う。
 *
 * <p>PNG・GIF・WebP は先頭のバイト（マジックナンバー）だけの偽のデータでよい。サーバーは形式の判定にしか
 * 中身を読まないため。JPEG は位置情報の除去が中身を解析するので、{@link ImageIO} で作った本物を使う。
 */
public final class TestImages {

	static final int WIDTH = 16;
	static final int HEIGHT = 16;

	private static final byte[] PNG_HEAD = {
		(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };

	private TestImages() {
	}

	/** {@link ImageIO} で作る 16×16 の本物の JPEG。Exif も XMP も持たない。画素は一様ではない。 */
	public static byte[] jpeg() {
		BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
		// 画素が一様だと、圧縮したデータがほぼ空になり、「画素が変わっていない」ことを確かめる意味が薄い。
		for (int y = 0; y < HEIGHT; y++) {
			for (int x = 0; x < WIDTH; x++) {
				image.setRGB(x, y, ((x * 16) << 16) | ((y * 16) << 8) | ((x + y) * 8));
			}
		}
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try {
			if (!ImageIO.write(image, "jpg", out)) {
				throw new IllegalStateException("JPEG の書き手が見つからない");
			}
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		return out.toByteArray();
	}

	/** {@link #jpeg()} に GPS（東経 139.7、北緯 35.6）と {@code Orientation=6} を書き足したもの。 */
	public static byte[] jpegWithGpsAndOrientation() {
		try {
			TiffOutputSet outputSet = new TiffOutputSet();
			outputSet.getOrCreateRootDirectory().add(TiffTagConstants.TIFF_TAG_ORIENTATION, (short) 6);
			outputSet.setGpsInDegrees(139.7, 35.6);
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			new ExifRewriter().updateExifMetadataLossless(jpeg(), out, outputSet);
			return out.toByteArray();
		} catch (IOException e) {
			throw new IllegalStateException("テスト用の JPEG を作れない", e);
		}
	}

	/**
	 * {@link #jpegWithGpsAndOrientation()} の GPS のディレクトリに、{@code marker}（ASCII）を
	 * GPSProcessingMethod として書き足したもの。座標の数値は Exif の中で 2 進の分数になり文字列として探せないが、
	 * これは文字列のまま入るので、バイト列に残っているかどうかを直接調べられる。
	 */
	public static byte[] jpegWithGpsMarker(String marker) {
		try {
			TiffOutputSet outputSet = new TiffOutputSet();
			outputSet.getOrCreateRootDirectory().add(TiffTagConstants.TIFF_TAG_ORIENTATION, (short) 6);
			outputSet.setGpsInDegrees(139.7, 35.6);
			outputSet.getOrCreateGpsDirectory().add(GpsTagConstants.GPS_TAG_GPS_PROCESSING_METHOD, marker);
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			new ExifRewriter().updateExifMetadataLossless(jpeg(), out, outputSet);
			return out.toByteArray();
		} catch (IOException e) {
			throw new IllegalStateException("テスト用の JPEG を作れない", e);
		}
	}

	/**
	 * 画素を符号化したデータ。最初の SOS（{@code FF DA}）のマーカーから末尾（EOI まで）のバイト列。
	 * JPEG の先頭からセグメントを長さでたどって SOS を探す（データの中の {@code FF DA} に引っかからないように）。
	 */
	public static byte[] scanData(byte[] jpeg) {
		int position = 2;
		while (position + 4 <= jpeg.length) {
			if ((jpeg[position] & 0xFF) != 0xFF) {
				throw new IllegalStateException("マーカーの位置がずれた: " + position);
			}
			int marker = jpeg[position + 1] & 0xFF;
			if (marker == 0xDA) {
				return Arrays.copyOfRange(jpeg, position, jpeg.length);
			}
			int length = ((jpeg[position + 2] & 0xFF) << 8) | (jpeg[position + 3] & 0xFF);
			position += 2 + length;
		}
		throw new IllegalStateException("SOS が見つからない");
	}

	/**
	 * 位置情報を持たない JPEG の先頭（SOI の直後）に、壊れた APP13（Photoshop / IPTC の入れ物）を差し込んだもの。
	 * Photoshop の識別子と {@code 8BIM} までは正しく、その先の資源の大きさが残りのバイト数を大きく超えている。
	 */
	public static byte[] jpegWithMalformedApp13() {
		byte[] identifier = "Photoshop 3.0\0".getBytes(StandardCharsets.US_ASCII);
		byte[] resource = {
			'8', 'B', 'I', 'M', 0x04, 0x04, 0x00, 0x00,
			0x7F, (byte) 0xFF, (byte) 0xFF, (byte) 0xF0, 0x01, 0x02 };
		int dataLength = identifier.length + resource.length;
		ByteBuffer app13 = ByteBuffer.allocate(2 + 2 + dataLength);
		app13.put((byte) 0xFF).put((byte) 0xED).putShort((short) (2 + dataLength));
		app13.put(identifier).put(resource);
		byte[] base = jpeg();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.write(base, 0, 2);
		out.writeBytes(app13.array());
		out.write(base, 2, base.length - 2);
		return out.toByteArray();
	}

	/** Exif は持つが GPS のディレクトリは持たない JPEG。{@code Orientation=6} だけを入れてある。 */
	public static byte[] jpegWithOrientationOnly() {
		try {
			TiffOutputSet outputSet = new TiffOutputSet();
			outputSet.getOrCreateRootDirectory().add(TiffTagConstants.TIFF_TAG_ORIENTATION, (short) 6);
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			new ExifRewriter().updateExifMetadataLossless(jpeg(), out, outputSet);
			return out.toByteArray();
		} catch (IOException e) {
			throw new IllegalStateException("テスト用の JPEG を作れない", e);
		}
	}

	/** XMP に {@code exif:GPSLatitude} を入れた JPEG。Exif は持たない。 */
	public static byte[] jpegWithXmpGps() {
		String xmp = "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">"
				+ "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
				+ "<rdf:Description xmlns:exif=\"http://ns.adobe.com/exif/1.0/\" "
				+ "exif:GPSLatitude=\"35,36.0N\" exif:GPSLongitude=\"139,42.0E\"/>"
				+ "</rdf:RDF></x:xmpmeta>";
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			new JpegXmpRewriter().updateXmpXml(jpeg(), out, xmp);
			return out.toByteArray();
		} catch (IOException e) {
			throw new IllegalStateException("テスト用の JPEG を作れない", e);
		}
	}

	/**
	 * Extended XMP の APP1 に {@code exif:GPSLatitude} を入れた JPEG。XMP が 64KB を超えるときに使われる別の入れ物で、
	 * 標準の XMP とは識別子が違う。JPEG の先頭（SOI）の直後に差し込む。
	 */
	public static byte[] jpegWithExtendedXmpGps() {
		byte[] identifier = "http://ns.adobe.com/xmp/extension/\0".getBytes(StandardCharsets.US_ASCII);
		byte[] guid = "0123456789ABCDEF0123456789ABCDEF".getBytes(StandardCharsets.US_ASCII);
		byte[] payload = ("<rdf:Description xmlns:exif=\"http://ns.adobe.com/exif/1.0/\" "
				+ "exif:GPSLatitude=\"35,36.0N\" exif:GPSLongitude=\"139,42.0E\"/>")
				.getBytes(StandardCharsets.UTF_8);
		int dataLength = identifier.length + guid.length + 4 + 4 + payload.length;
		ByteBuffer app1 = ByteBuffer.allocate(2 + 2 + dataLength);
		app1.put((byte) 0xFF).put((byte) 0xE1).putShort((short) (2 + dataLength));
		app1.put(identifier).put(guid).putInt(payload.length).putInt(0).put(payload);
		byte[] base = jpeg();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.write(base, 0, 2);
		out.writeBytes(app1.array());
		out.write(base, 2, base.length - 2);
		return out.toByteArray();
	}

	/** 先頭だけ JPEG で、中身がでたらめなデータ。「読み取れない JPEG」（422）の期待に使う。 */
	public static byte[] fakeJpeg() {
		byte[] content = new byte[64];
		Arrays.fill(content, (byte) 0x5A);
		content[0] = (byte) 0xFF;
		content[1] = (byte) 0xD8;
		content[2] = (byte) 0xFF;
		content[3] = (byte) 0xE0;
		return content;
	}

	public static byte[] png() {
		return withTail(PNG_HEAD, 8);
	}

	public static byte[] gif() {
		return withTail("GIF89a".getBytes(StandardCharsets.US_ASCII), 8);
	}

	public static byte[] webp() {
		byte[] head = new byte[12];
		System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, head, 0, 4);
		System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, head, 8, 4);
		return withTail(head, 8);
	}

	/** PNG の先頭の後ろを 0 で埋めて、ちょうど {@code size} バイトにしたもの。大きさの境界の検査に使う。 */
	public static byte[] pngOfSize(long size) {
		byte[] content = new byte[Math.toIntExact(size)];
		System.arraycopy(PNG_HEAD, 0, content, 0, PNG_HEAD.length);
		return content;
	}

	public static byte[] svg() {
		return "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"
				.getBytes(StandardCharsets.UTF_8);
	}

	public static byte[] text() {
		return "ただのテキストです".getBytes(StandardCharsets.UTF_8);
	}

	/** JPEG のメタデータを読み直す。Exif も XMP も無い JPEG では null になる。 */
	public static JpegImageMetadata metadataOf(byte[] jpeg) {
		try {
			return (JpegImageMetadata) Imaging.getMetadata(jpeg);
		} catch (IOException e) {
			throw new IllegalStateException("メタデータを読めない", e);
		}
	}

	private static byte[] withTail(byte[] head, int tailLength) {
		byte[] content = Arrays.copyOf(head, head.length + tailLength);
		Arrays.fill(content, head.length, content.length, (byte) 0x01);
		return content;
	}

}
