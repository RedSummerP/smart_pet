#!/usr/bin/env bash
# 真实 provider 冒烟：从本地 secrets 文件加载 key（绝不打印/进日志），跑 pi 全链路验证
# 用法：
#   1) 创建密钥文件（每行一个，以下任一名称即可）并收紧权限：
#        DEEPSEEK_API_KEY=sk-xxx      # DeepSeek 官方
#        SENSENOVA_API_KEY=xxx        # 商汤网关（token.sensenova.cn）
#        GROQ_API_KEY=xxx             # Groq
#      cp 模板：见下
#   2) ./scripts/smoke-real.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SECRETS=""
if [ -n "${SMART_PET_SECRETS:-}" ]; then
  SECRETS="$SMART_PET_SECRETS"
elif [ -f "$PWD/.tools/secrets.env" ]; then
  SECRETS="$PWD/.tools/secrets.env"
elif [ -f "$HOME/Desktop/.tools/secrets.env" ]; then
  SECRETS="$HOME/Desktop/.tools/secrets.env"
fi
if [ -z "$SECRETS" ] || [ ! -f "$SECRETS" ]; then
  echo "缺少密钥文件（已自动查找仓库 .tools/ 与 ~/Desktop/.tools/，或设 SMART_PET_SECRETS 指定）"
  echo "请创建它并写入（chmod 600）："
  echo "  DEEPSEEK_API_KEY=sk-xxx"
  echo "  SENSENOVA_API_KEY=xxx"
  echo "  GROQ_API_KEY=xxx"
  exit 1
fi
if [ "$(stat -c '%a' "$SECRETS" 2>/dev/null)" != "600" ] && [ "$(stat -f '%Lp' "$SECRETS" 2>/dev/null)" != "600" ]; then
  chmod 600 "$SECRETS"
fi

# 仅加载到本进程环境变量，任何路径都不打印内容
set -a
# shellcheck disable=SC1090
source "$SECRETS"
set +a

echo "== 密钥诊断（只显示变量名与长度，不显示值）=="
echo "文件中的变量名：$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$SECRETS" | sed 's/=$//' | tr '\n' ' ')"
for v in DEEPSEEK_API_KEY SENSENOVA_API_KEY GROQ_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY; do
  if [ -n "${!v:-}" ]; then
    printf '  %-22s 已设置（长度 %s）\n' "$v" "${#v}"
  else
    printf '  %-22s 未设置\n' "$v"
  fi
done

export SMART_PET_SMOKE=1
cd packages/ai
echo "== 运行真实 provider 冒烟（只输出脱敏摘要）=="
./node_modules/.bin/vitest run test/smoke.integration.test.ts