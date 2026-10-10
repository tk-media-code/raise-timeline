package com.tkmedia.raisetimeline.service;

import com.tkmedia.raisetimeline.domain.Post;
import com.tkmedia.raisetimeline.domain.PostWithAuthor;
import com.tkmedia.raisetimeline.dto.PostResponse;
import com.tkmedia.raisetimeline.error.FieldError;
import com.tkmedia.raisetimeline.error.ForbiddenException;
import com.tkmedia.raisetimeline.error.ImageStorageUnavailableException;
import com.tkmedia.raisetimeline.error.NotFoundException;
import com.tkmedia.raisetimeline.error.UnauthenticatedException;
import com.tkmedia.raisetimeline.error.ValidationException;
import com.tkmedia.raisetimeline.image.ImageCleaner;
import com.tkmedia.raisetimeline.image.ImageKeys;
import com.tkmedia.raisetimeline.image.ImageStorage;
import com.tkmedia.raisetimeline.image.ImageUploadRules;
import com.tkmedia.raisetimeline.image.PreparedImage;
import com.tkmedia.raisetimeline.logging.LogEvents;
import com.tkmedia.raisetimeline.logging.LogFields;
import com.tkmedia.raisetimeline.mapper.PostMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.web.multipart.MultipartFile;

/**
 * 投稿の作成・取得・編集・削除。
 *
 * <p>{@code @Transactional} は付けない。トランザクションが要るのは作成の「投稿の行と画像の行をまとめて入れる」ところだけで、
 * そこは {@link TransactionOperations} で範囲を絞る。メソッド全体に付けると、S3 への送信の間じゅう DB の
 * 接続を握ってしまう。本文と画像の中身はログに書かない。
 *
 * <p>画像の保存先（S3）と DB は 1 つのトランザクションにできない。そのため、作成は「検査 → 保存 → DB」の順にし、
 * DB が失敗したら保存済みのキーを消す。削除は「DB → 保存先」の順にし、保存先の削除が失敗しても成功として返す
 * （残った画像はどの行からも参照されない孤児になるだけ）。
 */
@Service
public class PostService {

	private static final Logger log = LoggerFactory.getLogger(PostService.class);

	/** 外部キーの名前（db/ の定義と合わせる）。違反したとき、どの参照が切れたかをこれで見分ける。 */
	private static final String USER_FOREIGN_KEY = "posts_user_id_fkey";

	private final PostMapper postMapper;
	private final PostAssembler assembler;
	private final ImageStorage imageStorage;
	private final ImageCleaner imageCleaner;
	private final TransactionOperations transactions;
	private final Clock clock;

	public PostService(PostMapper postMapper, PostAssembler assembler, ImageStorage imageStorage,
			ImageCleaner imageCleaner, TransactionOperations transactions, Clock clock) {
		this.postMapper = postMapper;
		this.assembler = assembler;
		this.imageStorage = imageStorage;
		this.imageCleaner = imageCleaner;
		this.transactions = transactions;
		this.clock = clock;
	}

	/**
	 * 判定の順序は、保存先が使えるか（503）、本文（422）、枚数（422）、画像 1 枚ずつ（422・413・415）。
	 * 保存先が使えない環境で画像を送った人には、本文の誤りより先に「今は画像を付けられない」と伝える
	 * （本文を直しても通らないため）。画像は 1 枚も保存しないうちに全部を検査する。
	 */
	public PostResponse create(UUID me, String rawBody, List<MultipartFile> images) {
		boolean hasImages = !images.isEmpty();
		if (hasImages && !imageStorage.isAvailable()) {
			throw new ImageStorageUnavailableException();
		}
		String body = PostBodyRules.validate(rawBody, hasImages);
		if (images.size() > ImageUploadRules.POST_MAX_COUNT) {
			throw new ValidationException(List.of(new FieldError("images", ImageUploadRules.TOO_MANY)));
		}
		List<PreparedImage> prepared = prepare(images);
		List<String> keys = upload(prepared);
		OffsetDateTime now = OffsetDateTime.now(clock);
		UUID id;
		try {
			id = Objects.requireNonNull(transactions.execute(status -> {
				UUID newId = postMapper.insert(new Post(null, me, body, now, now));
				if (!keys.isEmpty()) {
					postMapper.insertImages(newId, keys);
				}
				return newId;
			}));
		}
		catch (DataIntegrityViolationException e) {
			imageCleaner.deleteQuietly(keys);
			throw translate(e);
		}
		catch (RuntimeException e) {
			imageCleaner.deleteQuietly(keys);
			throw e;
		}
		return assembler.toResponse(postMapper.findById(id).orElseThrow(NotFoundException::new), me);
	}

	/** 送られた順に検査し、保存できる状態にする。1 枚でも通らなければ例外にし、何も保存しない。 */
	private static List<PreparedImage> prepare(List<MultipartFile> images) {
		List<PreparedImage> prepared = new ArrayList<>();
		for (MultipartFile file : images) {
			try {
				prepared.add(ImageUploadRules.prepare("images", file.getBytes(), ImageUploadRules.POST_MAX_BYTES));
			}
			catch (IOException e) {
				// 部品を読めないのはこちらの失敗（一時ファイルの読み出しなど）なので 500 にする。
				throw new UncheckedIOException(e);
			}
		}
		return prepared;
	}

	/**
	 * 1 枚ずつ順に保存し、保存したキーを返す。途中で失敗したら、そこまでに保存した分を消して例外を投げ直す
	 * （投稿の行が無いまま画像だけが残るのを避ける）。
	 */
	private List<String> upload(List<PreparedImage> prepared) {
		List<String> keys = new ArrayList<>();
		try {
			for (PreparedImage image : prepared) {
				String key = ImageKeys.post(image.type());
				imageStorage.put(key, image.content(), image.type().contentType());
				keys.add(key);
			}
		}
		catch (RuntimeException e) {
			imageCleaner.deleteQuietly(keys);
			throw e;
		}
		return keys;
	}

	/** {@code viewer} は見ている人。{@code likedByMe} の基準になる（投稿の持ち主とは限らない）。 */
	public PostResponse get(UUID viewer, UUID id) {
		return assembler.toResponse(postMapper.findById(id).orElseThrow(NotFoundException::new), viewer);
	}

	/** 判定の順序は 404、403、422。他人の投稿には、本文が不正でも 403 を返す。 */
	public PostResponse updateBody(UUID me, UUID id, String rawBody) {
		PostWithAuthor post = ownedBy(me, id);
		// 画像のある投稿は、本文を空にできる。画像の有無はこの時点の DB で見る。
		String body = PostBodyRules.validate(rawBody, !postMapper.findImageKeys(id).isEmpty());
		if (postMapper.updateBody(post.id(), body, OffsetDateTime.now(clock)) == 0) {
			throw new NotFoundException();
		}
		return assembler.toResponse(postMapper.findById(id).orElseThrow(NotFoundException::new), me);
	}

	public void delete(UUID me, UUID id) {
		ownedBy(me, id);
		// 行を消すと画像の行も一緒に消えてキーが分からなくなるので、先に読んでおく。
		List<String> keys = postMapper.findImageKeys(id);
		if (postMapper.delete(id) == 0) {
			throw new NotFoundException();
		}
		log.atInfo()
				.addKeyValue(LogFields.EVENT_ACTION, LogEvents.POST_DELETED)
				.addKeyValue(LogFields.APP_POST_ID, id.toString())
				.log("投稿を削除した");
		// 保存先の削除は DB が済んでから。失敗しても投稿の削除は成功として返す（ImageCleaner が WARN を残す）。
		imageCleaner.deleteQuietly(keys);
	}

	/** 投稿を読み、本人のものでなければ例外にする。無ければ 404、他人のなら 403。 */
	private PostWithAuthor ownedBy(UUID me, UUID id) {
		PostWithAuthor post = postMapper.findById(id).orElseThrow(NotFoundException::new);
		if (!post.userId().equals(me)) {
			throw new ForbiddenException();
		}
		return post;
	}

	/**
	 * 投稿者の外部キー違反は、トークンの利用者がもう居ない（有効期間中に消えた）ということなので、401 にする。
	 * 知らない制約は変換せず、そのまま投げて 500 にする（ERROR のログで気づけるように）。
	 */
	private static RuntimeException translate(DataIntegrityViolationException e) {
		String message = e.getMostSpecificCause().getMessage();
		if (message != null && message.contains(USER_FOREIGN_KEY)) {
			return new UnauthenticatedException();
		}
		return e;
	}

}
