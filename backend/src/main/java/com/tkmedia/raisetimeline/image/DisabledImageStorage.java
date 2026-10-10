package com.tkmedia.raisetimeline.image;

import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
import java.util.List;

/**
 * S3 の設定（{@code S3_BUCKET}）が無いときの保存先。
 *
 * <p>設定が無くてもアプリを起動できるようにするための代わり。画像を保存・削除しようとしたときだけ
 * {@link ImageStorageUnavailableException}（503）を投げ、画像に関係しない機能は普通に動く。
 */
public class DisabledImageStorage implements ImageStorage {

	@Override
	public boolean isAvailable() {
		return false;
	}

	@Override
	public String put(String key, byte[] content, String contentType) {
		throw new ImageStorageUnavailableException();
	}

	@Override
	public void deleteAll(List<String> keys) {
		throw new ImageStorageUnavailableException();
	}

	@Override
	public String urlOf(String key) {
		return null;
	}

}
