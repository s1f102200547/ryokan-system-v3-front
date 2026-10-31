#!/usr/bin/env bash
# 匿名化の実行（docs/LocalDevelopment.md §4.3 ANON-1〜5）
#   npm run anonymize -- --project <本番の project ID> --sa <閲覧専用 SA のメールアドレス>
#
# 1. Emulator 系の変数があれば何もせずに終了する（ANON-5）
# 2. 前回の認証情報が残っていれば削除する（ANON-4）
# 3. 閲覧専用 SA の権限を借りて ADC を作る（鍵ファイルは作らない。ANON-1）
# 4. anonymize.ts で全件を読み取り、匿名化データを書き出す
# 5. 終了時（正常終了・エラー・Ctrl+C）に、gcloud・ADC・Firebase CLI の認証情報を削除する（ANON-3）
set -euo pipefail

PROJECT=""
SA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="${2:-}"; shift 2 ;;
    --sa) SA="${2:-}"; shift 2 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$PROJECT" ] || [ -z "$SA" ]; then
  echo "使い方: npm run anonymize -- --project <本番の project ID> --sa <閲覧専用 SA のメールアドレス>" >&2
  exit 2
fi

# ANON-5: ログインを始める前に判定する
EMULATOR_VARS=$(env | cut -d= -f1 | grep -E '(_EMULATOR_HOST|^FIREBASE_EMULATOR_HUB)$' || true)
if [ -n "$EMULATOR_VARS" ]; then
  echo "匿名化を中止しました（Emulator 系の変数がある環境では実行しません）:" >&2
  echo "$EMULATOR_VARS" | sed 's/^/  - /' >&2
  exit 1
fi

GCLOUD_CONFIG_DIR="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}"
ADC_FILE="$GCLOUD_CONFIG_DIR/application_default_credentials.json"

cleanup() {
  # 各コマンドは「ログインしていない」で失敗するので、失敗を無視する
  gcloud auth application-default revoke --quiet >/dev/null 2>&1 || true
  if [ -f "$ADC_FILE" ]; then
    rm -f "$ADC_FILE"
    echo "  警告: ADC のファイルが残っていたため削除しました" >&2
  fi
  gcloud auth revoke --all --quiet >/dev/null 2>&1 || true
  if firebase login:list 2>/dev/null | grep -q "Logged in as"; then
    firebase logout >/dev/null 2>&1 || true
  fi

  local remaining=0
  if [ -n "$(gcloud auth list --format='value(account)' 2>/dev/null)" ]; then echo "  残っています: gcloud のユーザー認証" >&2; remaining=1; fi
  if [ -f "$ADC_FILE" ]; then echo "  残っています: $ADC_FILE" >&2; remaining=1; fi
  if firebase login:list 2>/dev/null | grep -q "Logged in as"; then echo "  残っています: Firebase CLI のログイン" >&2; remaining=1; fi
  if [ "$remaining" -eq 0 ]; then
    echo "  認証情報は残っていません（gcloud・ADC・Firebase CLI）"
  else
    echo "  上の認証情報を手で削除してください（OPS-4）" >&2
  fi
}

echo "前回の認証情報を確認しています..."
cleanup

on_exit() {
  local status=$?
  trap - EXIT INT TERM HUP
  echo "認証情報を削除しています..."
  cleanup
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

echo "閲覧専用 SA（$SA）の権限を借りてログインします。ブラウザでログインしてください。"
gcloud auth application-default login --impersonate-service-account="$SA"

npx tsx scripts/localdev/anonymize.ts --project "$PROJECT"
