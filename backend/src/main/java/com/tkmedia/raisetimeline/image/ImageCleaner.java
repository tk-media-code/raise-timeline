package com.tkmedia.raisetimeline.image;

import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 画像を消し、失敗しても呼び出し元には伝えない。
 *
 * <p>使うのは、DB の更新が済んだあとの後始末。ここで失敗しても、利用者の操作は成功として返す
 * （消せなかった画像は孤児になるだけで、誰にも参照されない）。握りつぶす代わりに、消せなかったキーを
 * WARN の {@code image.delete_failed} に残して、あとから拾えるようにする。
 */
@Component
public class ImageCleaner {

	private static final Logger log = LoggerFactory.getLogger(ImageCleaner.class);

	private final ImageStorage storage;

	public ImageCleaner(ImageStorage storage) {
		this.storage = storage;
	}

	public void deleteQuietly(List<String> keys) {
		if (keys.isEmpty()) {
			return;
		}
		try {
			storage.deleteAll(keys);
		}
		catch (RuntimeException e) {
			log.atWarn()
					.addKeyValue(LogFields.EVENT_ACTION, LogEvents.IMAGE_DELETE_FAILED)
					.addKeyValue(LogFields.APP_IMAGE_KEYS, keys)
					.setCause(e)
					.log("画像の削除に失敗した");
		}
	}

}
