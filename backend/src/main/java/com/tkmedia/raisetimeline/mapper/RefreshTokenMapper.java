package com.tkmedia.raisetimeline.mapper;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.tkmedia.raisetimeline.domain.RefreshToken;

@Mapper
public interface RefreshTokenMapper {

	void insert(@Param("userId") UUID userId, @Param("tokenHash") String tokenHash,
			@Param("expiresAt") OffsetDateTime expiresAt);

	/**
	 * 期限内のトークンの行を、更新が終わるまで他の更新に取られないよう押さえて読む。
	 * 知らない・期限切れなら null を返す。使用済みの行も返す（usedAt が入っている）。
	 */
	RefreshToken lockByTokenHash(@Param("tokenHash") String tokenHash, @Param("now") OffsetDateTime now);

	/** まだ使っていない行にだけ使った時刻を書き、書いた件数（0 か 1）を返す。使用済みの行の時刻は書き換えない。 */
	int markUsed(@Param("id") UUID id, @Param("usedAt") OffsetDateTime usedAt);

	/** その人の期限切れの行と、usedBefore 以前に使った行を消し、消した件数を返す。 */
	int deleteUnusableByUserId(@Param("userId") UUID userId, @Param("now") OffsetDateTime now,
			@Param("usedBefore") OffsetDateTime usedBefore);

	/** 期限に関わらずトークンを消し、持ち主の id を返す。無ければ null を返す。 */
	UUID deleteByTokenHash(String tokenHash);

}
