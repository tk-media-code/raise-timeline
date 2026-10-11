package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.image.ImageStorage;

/**
 * アイコンの URL を、保存先のキーから作る。
 *
 * <p>{@link ImageStorage} に default メソッドとして足さないのは、Mockito のモックでは default メソッドが
 * 実装を呼ばずに null を返すため、{@code ImageStorage} をモックしている既存のテストが壊れるから。
 */
final class AvatarUrls {

	private AvatarUrls() {
	}

	/** アイコンを設定していない人は {@code avatarKey} が null。そのときは URL も null にする（保存先は呼ばない）。 */
	static String of(ImageStorage imageStorage, String avatarKey) {
		return avatarKey == null ? null : imageStorage.urlOf(avatarKey);
	}

}
