package com.tkmedia.raisetimeline.mapper;

import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface HealthCheckMapper {

	int ping();

}
