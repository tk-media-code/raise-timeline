package com.tkmedia.raisetimeline.mapper.handler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

/**
 * {@link UUID} と PostgreSQL の uuid 型を対応づける。
 *
 * <p>MyBatis は {@code UUID} の既定の TypeHandler を持たず、{@code UUID} を「コンストラクタで組み立てる型」とみなして
 * 結果の詰め込みに失敗する（{@code arg-name-based-constructor-auto-mapping} が有効なため）。
 * 主キーがすべて UUID なので、列ごとに指定せず全体に登録する。
 */
@MappedTypes(UUID.class)
public class UuidTypeHandler extends BaseTypeHandler<UUID> {

	@Override
	public void setNonNullParameter(PreparedStatement ps, int i, UUID parameter, JdbcType jdbcType)
			throws SQLException {
		ps.setObject(i, parameter);
	}

	@Override
	public UUID getNullableResult(ResultSet rs, String columnName) throws SQLException {
		return rs.getObject(columnName, UUID.class);
	}

	@Override
	public UUID getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
		return rs.getObject(columnIndex, UUID.class);
	}

	@Override
	public UUID getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
		return cs.getObject(columnIndex, UUID.class);
	}

}
