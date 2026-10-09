package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.ReplacedAvatar;
import com.tkmedia.raisetimeline.dto.AvatarResponse;
import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.image.ImageCleaner;
import com.tkmedia.raisetimeline.image.ImageKeys;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.ImageUploadRules;
import com.tkmedia.raisetimeline.image.PreparedImage;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * アイコンの差し替え。
 *
 * <p>画像の保存先（S3）と DB は 1 つのトランザクションにできないので、「検査 → 保存 → DB → 古い画像の削除」の順にする。
 * 先に保存するのは、DB だけ新しいキーになって画像が無い状態を作らないため。保存が失敗したら DB は触らない。
 * DB の更新が空振り（本人の行が無い）のときは、保存した新しい画像を消す。古い画像の削除は DB が済んでから行い、
 * 失敗しても成功として返す（残った古い画像はどの行からも参照されない孤児になるだけ）。
 * {@code @Transactional} は付けない（S3 への送信の間じゅう DB の接続を握らないため）。画像の中身はログに書かない。
 */
@Service
public class AvatarService {

	private final UserMapper userMapper;
	private final ImageStorage imageStorage;
	private final ImageCleaner imageCleaner;
	private final Clock clock;

	public AvatarService(UserMapper userMapper, ImageStorage imageStorage, ImageCleaner imageCleaner, Clock clock) {
		this.userMapper = userMapper;
		this.imageStorage = imageStorage;
		this.imageCleaner = imageCleaner;
		this.clock = clock;
	}

	/**
	 * 判定の順序は、保存先が使えるか（503）、空（422）、大きさ（413）、形式（415）、JPEG の解析（422）。
	 * 保存先が使えない環境では、どんな画像を送っても通らないので、中身を調べる前に伝える。
	 */
	public AvatarResponse replace(UUID me, MultipartFile file) {
		if (!imageStorage.isAvailable()) {
			throw new ImageStorageUnavailableException();
		}
		PreparedImage image = ImageUploadRules.prepare("file", bytesOf(file), ImageUploadRules.AVATAR_MAX_BYTES);
		String key = ImageKeys.avatar(me, image.type());
		String url = imageStorage.put(key, image.content(), image.type().contentType());
		ReplacedAvatar replaced;
		try {
			replaced = userMapper.replaceAvatarKey(me, key, OffsetDateTime.now(clock))
					.orElseThrow(UnauthenticatedException::new);
		}
		catch (RuntimeException e) {
			// DB が更新できなかった（本人の行が消えた、DB の失敗）。新しい画像はどの行からも参照されないので消す。
			imageCleaner.deleteQuietly(List.of(key));
			throw e;
		}
		if (replaced.oldKey() != null) {
			imageCleaner.deleteQuietly(List.of(replaced.oldKey()));
		}
		return new AvatarResponse(url);
	}

	private static byte[] bytesOf(MultipartFile file) {
		try {
			return file.getBytes();
		}
		catch (IOException e) {
			// 部品を読めないのはこちらの失敗（一時ファイルの読み出しなど）なので 500 にする。
			throw new UncheckedIOException(e);
		}
	}

}
