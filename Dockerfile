# ベースイメージは digest で固定する（タグは付け替えられるが digest は変わらない。T6-4、T6-6）
# node:24-alpine = Node 24.22.2 / npm 11.19.1 / Alpine 3.24（2026-10-28 公開）。更新は Dependabot に任せる
# ── Stage 1: 依存パッケージのインストール ──────────────────────────────────
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS deps
WORKDIR /app
# .npmrc（公開から7日たっていない版を入れない・install スクリプトの制限）も一緒に渡す（T6-5）
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ── Stage 2: ビルド ──────────────────────────────────────────────────────────
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_ 変数はビルド時にクライアントバンドルへ埋め込まれる
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID

RUN npm run build

# ── Stage 3: 実行（最小イメージ）────────────────────────────────────────────
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runner
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
