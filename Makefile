# ローカル開発用のショートカット（docs/Development.md）
#   make        Emulator 起動 → データ投入 → 開発サーバー（Ctrl+C で全部止まる）
#   make help   ターゲット一覧

.DEFAULT_GOAL := local
.PHONY: local emulators seed dev anonymize check help

# 匿名化データ（.localdev/data/）があればそれを、なければ人工データ（tests/fixtures/localdev/）を投入する
SEED_ARGS := $(if $(wildcard .localdev/data/guestInfoV2.json),,-- --fixture)

local: ## Emulator 起動 → 投入 → 開発サーバー（http://127.0.0.1:3000、dev@example.com / dev-password）
	firebase emulators:exec --project demo-ryokan --only firestore,auth --ui "npm run seed $(SEED_ARGS) && npm run dev"

emulators: ## Emulator だけを起動する（データは空。別の端末で make seed を実行する）
	npm run emulators

seed: ## 起動中の Emulator にデータを投入し直す（全データとユーザーを消してから入れる）
	npm run seed $(SEED_ARGS)

dev: ## 開発サーバーだけを起動する（Emulator は別に起動しておく）
	npm run dev

anonymize: ## 本番から匿名化データを作る（ブラウザでログイン。終了時に認証情報を削除）
	npm run anonymize -- --project ryokan-system --sa anon-reader@ryokan-system.iam.gserviceaccount.com

check: ## lint・型チェック・unit/integration test・Emulator の往復検査・E2E（make で起動した Emulator / 開発サーバーは止めてから）
	npm run lint
	npx tsc --noEmit
	npm run test -- --run
	npm run test:tz
	npm run test:emulator
	npm run e2e
	npm run e2e:prod
	npm run e2e:emulator

help: ## ターゲット一覧
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:.*## /\t/'
