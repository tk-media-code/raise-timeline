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

	/** {@link ImageIO} で作る 16×16 の本物の JPEG。Exif も XMP も持たない。 */
	public static byte[] jpeg() {
		BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
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
