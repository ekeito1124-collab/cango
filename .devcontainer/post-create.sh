#!/usr/bin/env bash
set -euo pipefail

# 名前付きボリュームは root 所有で作成されるため node ユーザーに渡す
sudo chown -R node:node node_modules /home/node/.claude /home/node/.local

# Claude Code CLI は拡張機能のインストールに失敗してもターミナルから `claude` で使えるよう入れておく
npm install -g vercel @anthropic-ai/claude-code

if [ -f package.json ]; then
  npm install
fi

if [ -f prisma/schema.prisma ]; then
  npx prisma generate
fi

if [ ! -f .env.local ]; then
  echo "[info] .env.local がありません。'vercel link' → 'vercel env pull .env.local' で取得してください。"
fi
