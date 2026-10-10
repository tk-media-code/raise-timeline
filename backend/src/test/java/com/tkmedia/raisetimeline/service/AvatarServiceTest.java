package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.ReplacedAvatar;
import com.tkmedia.raisetimeline.dto.AvatarResponse;
import com.tkmedia.raisetimeline.error.FileTooLargeException;
import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.UnsupportedImageTypeException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.DisabledImageStorage;
import com.tkmedia.raisetimeline.image.ImageCleaner;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.ImageUploadRules;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.TestImages;
import com.tkmedia.raisetimeline.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class AvatarServiceTest {

	private static final UUID ME = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final Instant NOW_INSTANT = Instant.parse("2026-10-09T01:02:03Z");
	private static final OffsetDateTime NOW = OffsetDateTime.ofInstant(NOW_INSTANT, ZoneOffset.UTC);
	private static final String KEY_PATTERN = "avatars/" + ME + "/[0-9a-f-]{36}\\.png";

	private final UserMapper userMapper = mock(UserMapper.class);
	private final InMemoryImageStorage storage = new InMemoryImageStorage();
	private final AvatarService service = serviceWith(storage);

	private AvatarService serviceWith(ImageStorage imageStorage) {
		return new AvatarService(userMapper, imageStorage, new ImageCleaner(imageStorage),
				Clock.fixed(NOW_INSTANT, ZoneOffset.UTC));
	}

	private static MockMultipartFile part(byte[] content) {
		// 申告するファイル名と Content-Type は無視されるので、中身と合わない値にしておく。
		return new MockMultipartFile("file", "icon.jpg", "image/jpeg", content);
	}

	@Test
	@DisplayName("保存先が使えなければ ImageStorageUnavailableException で、Mapper は呼ばれない")
	void unavailableStorage() {
		AvatarService disabled = serviceWith(new DisabledImageStorage());

		assertThatThrownBy(() -> disabled.replace(ME, part(TestImages.png())))
				.isInstanceOf(ImageStorageUnavailableException.class);

		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("2 MB を超えるとき FileTooLargeException で、何も保存せず Mapper も呼ばない")
	void tooLarge() {
		assertThatThrownBy(() -> service.replace(ME,
				part(TestImages.pngOfSize(ImageUploadRules.AVATAR_MAX_BYTES + 1))))
				.isInstanceOf(FileTooLargeException.class);

		assertThat(storage.objects()).isEmpty();
		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("ちょうど 2 MB は通る")
	void exactlyTwoMegabytesPasses() {
		when(userMapper.replaceAvatarKey(any(), anyString(), any()))
				.thenReturn(Optional.of(new ReplacedAvatar(ME, null)));

		AvatarResponse response = service.replace(ME,
				part(TestImages.pngOfSize(ImageUploadRules.AVATAR_MAX_BYTES)));

		assertThat(response.avatarUrl()).startsWith("https://images.test/avatars/" + ME + "/");
	}

	@Test
	@DisplayName("SVG は UnsupportedImageTypeException で、何も保存せず Mapper も呼ばない")
	void svgIsRejected() {
		assertThatThrownBy(() -> service.replace(ME, part(TestImages.svg())))
				.isInstanceOf(UnsupportedImageTypeException.class);

		assertThat(storage.objects()).isEmpty();
		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("壊れた JPEG は項目 file の ValidationException で、何も保存せず Mapper も呼ばない")
	void brokenJpegIsRejected() {
		assertThatThrownBy(() -> service.replace(ME, part(TestImages.fakeJpeg())))
				.isInstanceOf(ValidationException.class)
				.satisfies(e -> assertThat(((ValidationException) e).errors()).extracting("field")
						.containsExactly("file"));

		assertThat(storage.objects()).isEmpty();
		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("空のファイルは項目 file の ValidationException")
	void emptyFileIsRejected() {
		assertThatThrownBy(() -> service.replace(ME, part(new byte[0])))
				.isInstanceOf(ValidationException.class)
				.satisfies(e -> assertThat(((ValidationException) e).errors()).extracting("field")
						.containsExactly("file"));

		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("成功するとキーは avatars/<本人>/<uuid>.<拡張子> で、Clock の時刻で更新し、URL を返して古いキーを消す")
	void replaceStoresUpdatesAndDeletesOld() {
		String oldKey = "avatars/" + ME + "/old.png";
		storage.put(oldKey, TestImages.png(), "image/png");
		when(userMapper.replaceAvatarKey(any(), anyString(), any()))
				.thenReturn(Optional.of(new ReplacedAvatar(ME, oldKey)));

		AvatarResponse response = service.replace(ME, part(TestImages.png()));

		String newKey = response.avatarUrl().substring("https://images.test/".length());
		assertThat(newKey).matches(KEY_PATTERN);
		verify(userMapper).replaceAvatarKey(ME, newKey, NOW);
		assertThat(storage.objects()).containsOnlyKeys(newKey);
		assertThat(storage.objects().get(newKey).contentType()).isEqualTo("image/png");
		assertThat(storage.deletedKeys()).containsExactly(oldKey);
	}

	@Test
	@DisplayName("初めての設定（古いキーが無い）では何も消さない")
	void firstAvatarDeletesNothing() {
		when(userMapper.replaceAvatarKey(any(), anyString(), any()))
				.thenReturn(Optional.of(new ReplacedAvatar(ME, null)));

		service.replace(ME, part(TestImages.png()));

		assertThat(storage.deletedKeys()).isEmpty();
		assertThat(storage.objects()).hasSize(1);
	}

	@Test
	@DisplayName("古いキーの削除が失敗しても、URL を返す")
	void oldKeyDeleteFailureStillSucceeds() {
		storage.failDeletes();
		when(userMapper.replaceAvatarKey(any(), anyString(), any()))
				.thenReturn(Optional.of(new ReplacedAvatar(ME, "avatars/" + ME + "/old.png")));

		AvatarResponse response = service.replace(ME, part(TestImages.png()));

		assertThat(response.avatarUrl()).startsWith("https://images.test/avatars/" + ME + "/");
	}

	@Test
	@DisplayName("保存が失敗すると例外で、Mapper は呼ばれない")
	void putFailureSkipsMapper() {
		storage.failPutOn(1);

		assertThatThrownBy(() -> service.replace(ME, part(TestImages.png())))
				.isInstanceOf(IllegalStateException.class);

		verifyNoInteractions(userMapper);
	}

	@Test
	@DisplayName("Mapper が空を返す（本人がもう居ない）と、新しいキーを消して UnauthenticatedException")
	void goneUserDeletesNewKey() {
		when(userMapper.replaceAvatarKey(any(), anyString(), any())).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.replace(ME, part(TestImages.png())))
				.isInstanceOf(UnauthenticatedException.class);

		assertThat(storage.objects()).isEmpty();
		assertThat(storage.deletedKeys()).hasSize(1);
	}

}
