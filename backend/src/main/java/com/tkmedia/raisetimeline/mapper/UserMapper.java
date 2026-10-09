package com.tkmedia.raisetimeline.mapper;

import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;

import com.tkmedia.raisetimeline.domain.User;

@Mapper
public interface UserMapper {

	/** 利用者を 1 行入れ、DB が採番した id を返す。 */
	UUID insert(User user);

	Optional<User> findById(UUID id);

	/** 大文字小文字を区別せずに引く。 */
	Optional<User> findByEmail(String email);

	/** 大文字小文字を区別せずに引く。 */
	Optional<User> findByUsername(String username);

	boolean existsByUsername(String username);

	boolean existsByEmail(String email);

}
