package com.tkmedia.raisetimeline.image;

import java.util.UUID;

/**
 * 画像を置く場所（オブジェクトキー）を決める。キーは毎回ランダムな UUID で作り、一度きりで上書きしない
 * （docs/image-storage-design.md 2 章）。
 *
 * <p>キーに投稿 id を入れないのは、DB に書く前に S3 へ上げるため。アイコンを同じキーで上書きしないのは、
 * ブラウザが古い画像をキャッシュしたまま表示するため。拡張子は申告されたファイル名ではなく、
 * 中身で判定した形式から付ける。
 */
public final class ImageKeys {

	private ImageKeys() {
	}

	public static String post(ImageType type) {
		return "posts/" + UUID.randomUUID() + "." + type.extension();
	}

	public static String avatar(UUID userId, ImageType type) {
		return "avatars/" + userId + "/" + UUID.randomUUID() + "." + type.extension();
	}

}
