#!/usr/bin/env bash
# 本地 CI 预检：等价于云端 CI 中除平台编译外的全部步骤（依赖安装/构建/测试）
# 用法：./scripts/ci-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NPM_CONFIG_STORE_DIR="${PNPM_STORE_DIR:-$PWD/.tools/pnpm-store}"
NPM_CONFIG_CACHE="${PNPM_CACHE_DIR:-$PWD/.tools/npm-cache}"
export npm_config_store_dir="$NPM_CONFIG_STORE_DIR"
export npm_config_cache="$NPM_CONFIG_CACHE"
export npm_config_update_notifier=false
export npm_config_fund=false
export npm_config_confirm_modules_purge=false
export CI=true

PACKAGES="core ai sync ui plugins plugins/games/memory-match plugins/games/2048 plugins/skins/classic"

echo "== 1/4 pnpm install（尽力而为，失败不阻塞后续校验）=="
pnpm install --store-dir "$NPM_CONFIG_STORE_DIR" 2>&1 | tail -2 || echo "  (install 失败，继续用现有 node_modules 校验)"

echo "== 2/4 build & typecheck =="
for p in $PACKAGES; do
  dir="packages/$p"
  [ -d "$dir" ] || dir="$p"
  if [ "$p" = "ui" ]; then
    (cd "$dir" && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ./node_modules/.bin/vite build >/dev/null && echo "build $p OK")
  else
    (cd "$dir" && ./node_modules/.bin/tsc -p tsconfig.json && echo "build $p OK")
  fi
done

echo "== 3/4 unit tests =="
FAILED=0
for p in $PACKAGES; do
  dir="packages/$p"
  [ -d "$dir" ] || dir="$p"
  out="$(cd "$dir" && ./node_modules/.bin/vitest run 2>&1)"
  summary="$(echo "$out" | grep -E "Tests +[0-9]" | tail -1)"
  if echo "$out" | grep -q "failed"; then
    echo "TEST FAIL $p :: $summary"
    FAILED=1
  else
    echo "TEST OK   $p :: $summary"
  fi
done

echo "== 4/4 git cleanliness =="
git status --short | head -5

if [ "$FAILED" = "1" ]; then
  echo "CI-LOCAL: FAILED"
  exit 1
fi
echo "CI-LOCAL: ALL GREEN"