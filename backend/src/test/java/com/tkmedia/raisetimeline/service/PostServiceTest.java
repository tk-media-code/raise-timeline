package com.tkmedia.raisetimeline.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.error.FileTooLargeException;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.UnsupportedImageTypeException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.DisabledImageStorage;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.ImageCleaner;
import com.tkmedia.raisetimeline.image.ImageUploadRules;
import com.tkmedia.raisetimeline.image.InMemoryImageStorage;
import com.tkmedia.raisetimeline.image.TestImages;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionOperations;

class PostServiceTest {

	private static final UUID ME = UUID.fromString("0199b000-0000-7000-8000-000000000001");
	private static final UUID OTHER = UUID.fromString("0199b000-0000-7000-8000-000000000002");
	private static final UUID POST_ID = UUID.fromString("0199b000-0000-7000-8000-0000000000a1");
	private static final Instant NOW_INSTANT = Instant.parse("2026-10-09T01:02:03Z");
	private static final OffsetDateTime NOW = OffsetDateTime.ofInstant(NOW_INSTANT, ZoneOffset.UTC);

	private final PostMapper postMapper = mock(PostMapper.class);
	private final InMemoryImageStorage storage = new InMemoryImageStorage();
	private final PostService service = serviceWith(storage);

	private PostService serviceWith(ImageStorage imageStorage) {
		return new PostService(postMapper, new PostAssembler(postMapper, imageStorage), imageStorage,
				new ImageCleaner(imageStorage), TransactionOperations.withoutTransaction(),
				Clock.fixed(NOW_INSTANT, ZoneOffset.UTC));
	}

	private static MockMultipartFile part(byte[] content) {
		// 申告するファイル名と Content-Type は無視されるので、中身と合わない値にしておく。
		return new MockMultipartFile("images", "photo.jpg", "image/jpeg", content);
	}

	private static PostWithAuthor row(UUID owner, String body) {
		return new PostWithAuthor(POST_ID, owner, body, NOW, NOW, "taro_1", "太郎", null);
	}

	private static DataIntegrityViolationException violation(String constraint) {
		return new DataIntegrityViolationException("x", new SQLException(
				"insert or update on table \"posts\" violates foreign key constraint \"" + constraint + "\""));
	}

	@Test
	@DisplayName("create は正規化した本文で insert し、findById の結果を組み立てて返す")
	void createInsertsNormalizedBody() {
		when(postMapper.insert(any())).thenReturn(POST_ID);
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "一行目\n二行目")));

		PostResponse response = service.create(ME, "一行目\r\n二行目", List.of());

		verify(postMapper).insert(new Post(null, ME, "一行目\n二行目", NOW, NOW));
		assertThat(response.id()).isEqualTo(POST_ID);
		assertThat(response.body()).isEqualTo("一行目\n二行目");
		assertThat(response.author().username()).isEqualTo("taro_1");
	}

	@Test
	@DisplayName("create は本文が空白だけなら ValidationException で、insert を呼ばない")
	void createRejectsWhitespaceOnly() {
		assertThatThrownBy(() -> service.create(ME, " \n　 ", List.of())).isInstanceOf(ValidationException.class);

		verify(postMapper, never()).insert(any());
	}

	@Test
	@DisplayName("create は投稿者の外部キー違反を UnauthenticatedException にする")
	void createTranslatesUserForeignKeyViolation() {
		when(postMapper.insert(any())).thenThrow(violation("posts_user_id_fkey"));

		assertThatThrownBy(() -> service.create(ME, "こんにちは", List.of())).isInstanceOf(UnauthenticatedException.class);
	}

	@Test
	@DisplayName("create は別の制約の違反を変換せず、同じ例外のまま投げ直す")
	void createRethrowsUnknownConstraint() {
		DataIntegrityViolationException other = violation("posts_something_else_fkey");
		when(postMapper.insert(any())).thenThrow(other);

		assertThatThrownBy(() -> service.create(ME, "こんにちは", List.of())).isSameAs(other);
	}

	@Test
	@DisplayName("get は無い id で NotFoundException")
	void getMissing() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.get(POST_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("get は投稿を応答の形にして返す")
	void getReturnsPost() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人の投稿")));

		assertThat(service.get(POST_ID).body()).isEqualTo("他人の投稿");
	}

	@Test
	@DisplayName("updateBody は無い id で NotFoundException")
	void updateMissing() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "直した")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("updateBody は他人の投稿で ForbiddenException になり、updateBody を呼ばない")
	void updateOthers() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人")));

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "直した")).isInstanceOf(ForbiddenException.class);

		verify(postMapper, never()).updateBody(any(), any(), any());
	}

	@Test
	@DisplayName("updateBody は自分の投稿なら、正規化した本文と now で更新して、読み直した投稿を返す")
	void updateOwn() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "元")))
				.thenReturn(Optional.of(
						new PostWithAuthor(POST_ID, ME, "直した\n本文", NOW, NOW.plusSeconds(5), "taro_1", "太郎", null)));
		when(postMapper.updateBody(POST_ID, "直した\n本文", NOW)).thenReturn(1);

		PostResponse response = service.updateBody(ME, POST_ID, "直した\r\n本文");

		verify(postMapper).updateBody(POST_ID, "直した\n本文", NOW);
		assertThat(response.body()).isEqualTo("直した\n本文");
		assertThat(response.edited()).isTrue();
	}

	@Test
	@DisplayName("updateBody は更新が 0 行なら NotFoundException（読んだ後に消された）")
	void updateAffectsNoRow() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "元")));
		when(postMapper.updateBody(any(), any(), any())).thenReturn(0);

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "直した")).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("updateBody の判定は 404、403、422 の順。他人の投稿なら、本文が不正でも 403")
	void updateOrderIs404Then403Then422() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人")));
		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "a\u0000b")).isInstanceOf(ForbiddenException.class);

		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());
		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "a\u0000b")).isInstanceOf(NotFoundException.class);

		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, "a\u0000b")).isInstanceOf(ValidationException.class);
		verify(postMapper, never()).updateBody(any(), any(), any());
	}

	@Test
	@DisplayName("delete は無い id で NotFoundException")
	void deleteMissing() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("delete は他人の投稿で ForbiddenException になり、delete を呼ばない")
	void deleteOthers() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(OTHER, "他人")));

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(ForbiddenException.class);

		verify(postMapper, never()).delete(any());
	}

	@Test
	@DisplayName("delete は自分の投稿なら delete(id) を呼ぶ")
	void deleteOwn() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.delete(POST_ID)).thenReturn(1);

		service.delete(ME, POST_ID);

		verify(postMapper).delete(POST_ID);
	}

	@Test
	@DisplayName("delete は 0 行なら NotFoundException（読んだ後に消された）")
	void deleteAffectsNoRow() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.delete(POST_ID)).thenReturn(0);

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(NotFoundException.class);
	}

	@Test
	@DisplayName("保存先が使えず画像があると、本文が 281 文字でも 503 になる（本文の検査より先）")
	void createWithImagesWhenStorageUnavailableReturns503BeforeBodyCheck() {
		PostService disabled = serviceWith(new DisabledImageStorage());

		assertThatThrownBy(() -> disabled.create(ME, "あ".repeat(281), List.of(part(TestImages.png()))))
				.isInstanceOf(ImageStorageUnavailableException.class);

		verify(postMapper, never()).insert(any());
	}

	@Test
	@DisplayName("保存先が使えなくても、画像が無ければ今までどおり作れる")
	void createWithoutImagesWhenStorageUnavailable() {
		PostService disabled = serviceWith(new DisabledImageStorage());
		when(postMapper.insert(any())).thenReturn(POST_ID);
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "本文だけ")));

		assertThat(disabled.create(ME, "本文だけ", List.of()).body()).isEqualTo("本文だけ");
	}

	@Test
	@DisplayName("本文が 281 文字で画像が 1 枚なら 422 で、field は body。何も PUT しない")
	void createRejectsLongBodyEvenWithImage() {
		assertThatThrownBy(() -> service.create(ME, "あ".repeat(281), List.of(part(TestImages.png()))))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).extracting("field").containsExactly("body"));

		assertThat(storage.objects()).isEmpty();
		verify(postMapper, never()).insert(any());
	}

	@Test
	@DisplayName("5 枚は 422「画像は 4 枚までです」で、field は images。何も PUT しない")
	void createRejectsFiveImages() {
		List<MockMultipartFile> five = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			five.add(part(TestImages.png()));
		}

		assertThatThrownBy(() -> service.create(ME, "本文", List.copyOf(five)))
				.isInstanceOfSatisfying(ValidationException.class, e -> {
					assertThat(e.errors()).extracting("field").containsExactly("images");
					assertThat(e.errors()).extracting("message").containsExactly("画像は 4 枚までです");
					assertThat(e.errors().get(0).message()).isEqualTo(ImageUploadRules.TOO_MANY);
				});

		assertThat(storage.objects()).isEmpty();
	}

	@Test
	@DisplayName("4 枚は送った順に posts/<uuid>.<拡張子> で PUT され、insertImages のキーも同じ順")
	void createUploadsFourImagesInSentOrder() {
		when(postMapper.insert(any())).thenReturn(POST_ID);
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "本文")));

		service.create(ME, "本文", List.of(part(TestImages.jpeg()), part(TestImages.png()),
				part(TestImages.gif()), part(TestImages.webp())));

		List<String> keys = new ArrayList<>(storage.objects().keySet());
		assertThat(keys).hasSize(4);
		assertThat(keys.get(0)).matches("posts/[0-9a-f-]{36}\\.jpg");
		assertThat(keys.get(1)).matches("posts/[0-9a-f-]{36}\\.png");
		assertThat(keys.get(2)).matches("posts/[0-9a-f-]{36}\\.gif");
		assertThat(keys.get(3)).matches("posts/[0-9a-f-]{36}\\.webp");
		assertThat(storage.objects().values()).extracting(o -> o.contentType())
				.containsExactly("image/jpeg", "image/png", "image/gif", "image/webp");
		verify(postMapper).insertImages(POST_ID, keys);
	}

	@Test
	@DisplayName("本文が空で画像だけなら作れる（本文は空文字で保存する）")
	void createWithImageOnly() {
		when(postMapper.insert(any())).thenReturn(POST_ID);
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "")));

		service.create(ME, "", List.of(part(TestImages.png())));

		verify(postMapper).insert(new Post(null, ME, "", NOW, NOW));
		assertThat(storage.objects()).hasSize(1);
	}

	@Test
	@DisplayName("2 枚目の検査で 415 なら、何も PUT されず、insert も呼ばれない")
	void createChecksAllImagesBeforeUploading() {
		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.png()), part(TestImages.svg()))))
				.isInstanceOf(UnsupportedImageTypeException.class);

		assertThat(storage.objects()).isEmpty();
		verify(postMapper, never()).insert(any());
	}

	@Test
	@DisplayName("5 MB を超える画像は 413、空のファイルと壊れた JPEG は 422（field は images）")
	void createRejectsTooLargeEmptyAndBrokenImages() {
		assertThatThrownBy(() -> service.create(ME, "本文",
				List.of(part(TestImages.pngOfSize(ImageUploadRules.POST_MAX_BYTES + 1)))))
				.isInstanceOf(FileTooLargeException.class);
		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(new byte[0]))))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).extracting("field").containsExactly("images"));
		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.fakeJpeg()))))
				.isInstanceOfSatisfying(ValidationException.class,
						e -> assertThat(e.errors()).extracting("field").containsExactly("images"));

		assertThat(storage.objects()).isEmpty();
	}

	@Test
	@DisplayName("2 枚目の PUT が失敗すると、その例外がそのまま上がり、1 枚目のキーが消され、insert は呼ばれない")
	void createCleansUploadedKeysWhenPutFails() {
		storage.failPutOn(2);

		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.png()), part(TestImages.png()))))
				.isInstanceOf(IllegalStateException.class);

		assertThat(storage.objects()).isEmpty();
		assertThat(storage.deletedKeys()).hasSize(1);
		verify(postMapper, never()).insert(any());
	}

	@Test
	@DisplayName("insertImages が失敗すると、上げたキーが全部消され、例外はそのまま上がる")
	void createCleansUploadedKeysWhenInsertImagesFails() {
		when(postMapper.insert(any())).thenReturn(POST_ID);
		IllegalStateException failure = new IllegalStateException("insertImages 失敗");
		doThrow(failure).when(postMapper).insertImages(any(), any());

		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.png()), part(TestImages.gif()))))
				.isSameAs(failure);

		assertThat(storage.objects()).isEmpty();
		assertThat(storage.deletedKeys()).hasSize(2);
	}

	@Test
	@DisplayName("投稿者の外部キー違反は UnauthenticatedException になり、上げたキーが消される")
	void createTranslatesForeignKeyViolationAndCleansKeys() {
		when(postMapper.insert(any())).thenThrow(violation("posts_user_id_fkey"));

		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.png()))))
				.isInstanceOf(UnauthenticatedException.class);

		assertThat(storage.objects()).isEmpty();
		assertThat(storage.deletedKeys()).hasSize(1);
	}

	@Test
	@DisplayName("知らない制約の違反は変換せず、上げたキーを消して同じ例外のまま投げる")
	void createRethrowsUnknownViolationAndCleansKeys() {
		DataIntegrityViolationException other = violation("posts_something_else_fkey");
		when(postMapper.insert(any())).thenThrow(other);

		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.png())))).isSameAs(other);

		assertThat(storage.deletedKeys()).hasSize(1);
	}

	@Test
	@DisplayName("DB の書き込みが失敗したあとのキーの削除が失敗しても、元の例外が上がる")
	void createKeepsOriginalExceptionWhenCleanupFails() {
		DataIntegrityViolationException other = violation("posts_something_else_fkey");
		when(postMapper.insert(any())).thenThrow(other);
		storage.failDeletes();

		assertThatThrownBy(() -> service.create(ME, "本文", List.of(part(TestImages.png())))).isSameAs(other);
	}

	@Test
	@DisplayName("updateBody は画像のある投稿なら、本文を空にできる")
	void updateAllowsEmptyBodyWhenPostHasImages() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "元")));
		when(postMapper.findImageKeys(POST_ID)).thenReturn(List.of("posts/a.jpg"));
		when(postMapper.updateBody(POST_ID, "", NOW)).thenReturn(1);

		service.updateBody(ME, POST_ID, "");

		verify(postMapper).updateBody(POST_ID, "", NOW);
	}

	@Test
	@DisplayName("updateBody は画像の無い投稿なら、本文を空にすると 422")
	void updateRejectsEmptyBodyWhenPostHasNoImages() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "元")));
		when(postMapper.findImageKeys(POST_ID)).thenReturn(List.of());

		assertThatThrownBy(() -> service.updateBody(ME, POST_ID, " ")).isInstanceOf(ValidationException.class);

		verify(postMapper, never()).updateBody(any(), any(), any());
	}

	@Test
	@DisplayName("delete は画像のキーを行を消す前に読み、消せたあとに deleteAll へ渡す")
	void deleteRemovesImagesFromStorage() {
		storage.put("posts/a.jpg", new byte[] { 1 }, "image/jpeg");
		storage.put("posts/b.png", new byte[] { 2 }, "image/png");
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.findImageKeys(POST_ID)).thenReturn(List.of("posts/a.jpg", "posts/b.png"));
		when(postMapper.delete(POST_ID)).thenReturn(1);

		service.delete(ME, POST_ID);

		InOrder order = inOrder(postMapper);
		order.verify(postMapper).findImageKeys(POST_ID);
		order.verify(postMapper).delete(POST_ID);
		assertThat(storage.deletedKeys()).containsExactly("posts/a.jpg", "posts/b.png");
		assertThat(storage.objects()).isEmpty();
	}

	@Test
	@DisplayName("delete は deleteAll が失敗しても例外にしない")
	void deleteSucceedsEvenWhenStorageDeleteFails() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.findImageKeys(POST_ID)).thenReturn(List.of("posts/a.jpg"));
		when(postMapper.delete(POST_ID)).thenReturn(1);
		storage.failDeletes();

		service.delete(ME, POST_ID);

		verify(postMapper).delete(POST_ID);
	}

	@Test
	@DisplayName("delete は行が消せなかった（0 行）ときは、画像を消さない")
	void deleteKeepsImagesWhenRowNotDeleted() {
		when(postMapper.findById(POST_ID)).thenReturn(Optional.of(row(ME, "自分")));
		when(postMapper.findImageKeys(POST_ID)).thenReturn(List.of("posts/a.jpg"));
		when(postMapper.delete(POST_ID)).thenReturn(0);

		assertThatThrownBy(() -> service.delete(ME, POST_ID)).isInstanceOf(NotFoundException.class);

		assertThat(storage.deletedKeys()).isEmpty();
	}

}
