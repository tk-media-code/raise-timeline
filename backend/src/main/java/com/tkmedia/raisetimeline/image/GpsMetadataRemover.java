package com.tkmedia.raisetimeline.image;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.apache.commons.imaging.Imaging;
import org.apache.commons.imaging.common.ImageMetadata;
import org.apache.commons.imaging.formats.jpeg.JpegImageMetadata;
import org.apache.commons.imaging.formats.jpeg.exif.ExifRewriter;
import org.apache.commons.imaging.formats.jpeg.xmp.JpegXmpRewriter;
import org.apache.commons.imaging.formats.tiff.TiffImageMetadata;
import org.apache.commons.imaging.formats.tiff.constants.TiffDirectoryConstants;
import org.apache.commons.imaging.formats.tiff.write.TiffOutputDirectory;
import org.apache.commons.imaging.formats.tiff.write.TiffOutputSet;

/**
 * JPEG から撮影地の位置情報を取り除く。Apache Commons Imaging を使うのはこのクラスだけ。
 *
 * <p>Exif は GPS のディレクトリ（撮影地の座標）だけを除き、Orientation（写真の向き）など他のタグは残す。
 * 向きのタグまで消すと、縦に撮った写真が横倒しで表示されてしまうため。書き戻しは画素に触れない
 * （lossless）。XMP は {@code exif:GPSLatitude} などが入ることがあるので、丸ごと取り除く。
 *
 * <p>GPS が無い JPEG は Exif を書き換えない。書き換えるほど元の Exif を壊す機会が増えるだけで、
 * 得るものが無いため。
 *
 * <p>解析に失敗した JPEG は {@link UnreadableImageException} にする。位置情報を消せたか確かめられない
 * ものを、そのまま保存しないため。壊れた入力ではライブラリが {@link RuntimeException} を投げることもあるので、
 * それも同じ扱いにする。
 */
public final class GpsMetadataRemover {

	private GpsMetadataRemover() {
	}

	/** 位置情報を除いた JPEG を返す。入力は書き換えない。 */
	public static byte[] strip(byte[] jpeg) throws UnreadableImageException {
		try {
			byte[] withoutGps = removeGpsFromExif(jpeg);
			ByteArrayOutputStream out = new ByteArrayOutputStream(withoutGps.length);
			new JpegXmpRewriter().removeXmpXml(withoutGps, out);
			return out.toByteArray();
		} catch (IOException | RuntimeException e) {
			throw new UnreadableImageException(e);
		}
	}

	private static byte[] removeGpsFromExif(byte[] jpeg) throws IOException {
		ImageMetadata metadata = Imaging.getMetadata(jpeg);
		if (!(metadata instanceof JpegImageMetadata jpegMetadata)) {
			return jpeg;
		}
		TiffImageMetadata exif = jpegMetadata.getExif();
		if (exif == null || exif.findDirectory(TiffDirectoryConstants.DIRECTORY_TYPE_GPS) == null) {
			return jpeg;
		}
		TiffOutputSet original = exif.getOutputSet();
		// getDirectories() は写しを返すので、そこから消しても元には効かない。GPS 以外を新しい組へ移して作り直す。
		// IFD0 の GPSInfo（GPS のディレクトリの場所を指す項目）は、ライブラリが書き出すときにディレクトリの有無から
		// 作り直すため、ディレクトリを移さなければ指し先も残らない。
		TiffOutputSet outputSet = new TiffOutputSet(original.byteOrder);
		for (TiffOutputDirectory directory : original.getDirectories()) {
			if (directory.getType() != TiffDirectoryConstants.DIRECTORY_TYPE_GPS) {
				outputSet.addDirectory(directory);
			}
		}
		ByteArrayOutputStream out = new ByteArrayOutputStream(jpeg.length);
		new ExifRewriter().updateExifMetadataLossless(jpeg, out, outputSet);
		return out.toByteArray();
	}

}
