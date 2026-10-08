package com.tkmedia.raisetimeline.mapper;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface RefreshTokenMapper {

	void insert(@Param("userId") UUID userId, @Param("tokenHash") String tokenHash,
			@Param("expiresAt") OffsetDateTime expiresAt);

	/** 期限内のトークンを 1 回だけ使い切る。消した行の持ち主の id を返し、無い・期限切れなら null を返す。 */
	UUID consume(@Param("tokenHash") String tokenHash, @Param("now") OffsetDateTime now);

	/** 期限に関わらずトークンを消し、持ち主の id を返す。無ければ null を返す。 */
	UUID deleteByTokenHash(String tokenHash);

	/** その人の期限切れのトークンを消し、消した件数を返す。 */
	int deleteExpiredByUserId(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

}
