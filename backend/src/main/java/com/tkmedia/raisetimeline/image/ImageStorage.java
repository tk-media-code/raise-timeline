package com.tkmedia.raisetimeline.image;

import java.util.List;

/**
 * 画像の保存先。実装は、S3 に置く {@link S3ImageStorage} と、設定が無いときの {@link DisabledImageStorage}。
 *
 * <p>操作は 4 つだけにしている。1 件だけ消す {@code delete} は持たない。消す場面はどれも「投稿やアバターに
 * 結びついたキーをまとめて」なので、{@link #deleteAll} 1 つで足りる（入口を増やすと、失敗の扱いが散らばる）。
 */
public interface ImageStorage {

	/** 画像の保存先として使えるか。{@link DisabledImageStorage} だけが false を返す。 */
	boolean isAvailable();

	/**
	 * 保存して、公開 URL を返す。
	 *
	 * @param key 保存先のキー（{@link ImageKeys} が作る）
	 * @param content 画像のバイト列
	 * @param contentType 検出した形式の MIME タイプ
	 */
	String put(String key, byte[] content, String contentType);

	/** キーをまとめて消す。空なら何もしない。消せなかったときは例外を投げる。 */
	void deleteAll(List<String> keys);

	/** キーから公開 URL を作る。保存先が使えない（{@link DisabledImageStorage}）ときは null。 */
	String urlOf(String key);

}
