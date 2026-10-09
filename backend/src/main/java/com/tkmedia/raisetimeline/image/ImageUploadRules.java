package com.tkmedia.raisetimeline.image;

import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.FileTooLargeException;
import com.tkmedia.raisetimeline.error.UnsupportedImageTypeException;
import com.tkmedia.raisetimeline.error.ValidationException;
import java.util.List;

/**
 * アップロードされた画像 1 枚の検査。投稿画像とアイコンが同じ判定を通るよう、1 か所にまとめる。
 *
 * <p>順序: (1) 空 (422) (2) 大きさ (413) (3) 形式 (415) (4) JPEG なら位置情報の除去 (422)。
 *
 * <p>大きさを形式より先に見るのは、大きなファイルの先頭を調べる前に断るため。空を最初に見るのは、
 * 空のファイルを「形式が違う」と案内しても利用者が直せないため。(4) で解析に失敗したときも 422 にする。
 * 位置情報を消せないまま保存すると撮影地が漏れるが、利用者の入力で起きる失敗なので 500 にもしない。
 *
 * <p>大きさは 2 進で数える。5 MB は 5,242,880 バイト、2 MB は 2,097,152 バイト（Spring の {@code DataSize} と同じ）。
 */
public final class ImageUploadRules {

	public static final long POST_MAX_BYTES = 5_242_880L;
	public static final long AVATAR_MAX_BYTES = 2_097_152L;
	public static final int POST_MAX_COUNT = 4;

	/** 空のファイルと、解析できない JPEG の両方で使う文言。 */
	public static final String UNREADABLE = "画像を読み取れませんでした";

	private ImageUploadRules() {
	}

	/**
	 * 検査を通して保存できる状態にする。
	 *
	 * @param field 失敗を報告する要求の項目名（{@code images} か {@code avatar}）
	 * @param content アップロードされた中身
	 * @param maxBytes 許す大きさ（バイト）。ちょうどこの大きさまでは通る
	 */
	public static PreparedImage prepare(String field, byte[] content, long maxBytes) {
		if (content.length == 0) {
			throw unreadable(field);
		}
		if (content.length > maxBytes) {
			throw new FileTooLargeException();
		}
		ImageType type = ImageTypeDetector.detect(content).orElseThrow(UnsupportedImageTypeException::new);
		if (type != ImageType.JPEG) {
			return new PreparedImage(content, type);
		}
		try {
			return new PreparedImage(GpsMetadataRemover.strip(content), type);
		} catch (UnreadableImageException e) {
			throw unreadable(field);
		}
	}

	private static ValidationException unreadable(String field) {
		return new ValidationException(List.of(new FieldError(field, UNREADABLE)));
	}

}
