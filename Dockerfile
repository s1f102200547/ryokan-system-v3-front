# ベースイメージは digest で固定する（タグは付け替えられるが digest は変わらない）
# node:26-alpine = Node 26.13.0 / npm 11.20.0 / Alpine 3.24（2026-10-28 公開）。minor・patch の更新は Dependabot に任せる
# ── Stage 1: 依存パッケージのインストール ──────────────────────────────────
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS deps
WORKDIR /app
# .npmrc（公開から7日たっていない版を入れない・install スクリプトの制限）も一緒に渡す
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ── Stage 2: ビルド ──────────────────────────────────────────────────────────
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ブラウザは Firebase を呼ばないので、ビルド時に埋め込む NEXT_PUBLIC_ の変数はない。
# パスワードの確認に使う API キー（FIREBASE_AUTH_API_KEY）は、実行時に Cloud Run が Secret Manager から渡す

RUN npm run build

# ── Stage 3: 実行（最小イメージ）────────────────────────────────────────────
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner
WORKDIR /app

ENV NODE_ENV=production
# Cloud Run は PORT 環境変数でポートを注入する（デフォルト 8080）
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# 非 root ユーザーで実行
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
