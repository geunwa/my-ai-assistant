#!/bin/sh
# Vercel 배포 때 한 번 실행된다.
# 화면 파일을 dist 폴더로 복사하고, Vercel 환경 변수 API_BASE_URL로 config.js를 새로 만든다.
# 환경 변수가 없으면 저장소의 config.js를 그대로 쓴다.
# 내 PC에서는 이 스크립트를 실행하지 않고 frontend 폴더를 바로 연다.
set -e

rm -rf dist
mkdir dist
cp index.html style.css app.js dist/
cp -r assets dist/

if [ -n "$API_BASE_URL" ]; then
  # http(s) 주소 형식만 받는다 (따옴표 등이 섞이면 배포를 멈춘다)
  if ! printf '%s' "$API_BASE_URL" | grep -Eq '^https?://[A-Za-z0-9.:/-]+$'; then
    echo "API_BASE_URL 형식이 올바르지 않습니다: $API_BASE_URL" >&2
    exit 1
  fi
  printf '// 배포 때 build.sh가 Vercel 환경 변수 API_BASE_URL로 만든 파일\nwindow.APP_CONFIG = {\n  API_BASE_URL: "%s",\n};\n' "$API_BASE_URL" > dist/config.js
  echo "config.js: Vercel 환경 변수 API_BASE_URL 사용 ($API_BASE_URL)"
else
  cp config.js dist/
  echo "config.js: API_BASE_URL 환경 변수가 없어 저장소의 config.js 사용"
fi
