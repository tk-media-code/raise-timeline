#!/bin/bash
# テスト用の DB を作る。postgres の公式イメージは、データが空の初回起動時だけ
# /docker-entrypoint-initdb.d のスクリプトを走らせる。すでに DB がある環境では走らない。
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE ${POSTGRES_DB}_test OWNER ${POSTGRES_USER};"
