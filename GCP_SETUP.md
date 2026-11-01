# GCP / GitHub Actions セットアップ手順

main へ merge すると自動で Cloud Run にデプロイされる CI/CD の初回セットアップ手順。

---

## 前提条件

- `gcloud` CLI インストール済み・ログイン済み
- GCP プロジェクト作成済み
- GitHub リポジトリへの Admin 権限

---

## 1. GCP — API 有効化

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  --project=YOUR_PROJECT_ID
```

---

## 2. GCP — Artifact Registry リポジトリ作成

Docker イメージの保存先。

```bash
gcloud artifacts repositories create ryokan \
  --repository-format=docker \
  --location=asia-northeast1 \
  --project=YOUR_PROJECT_ID
```

---

## 3. GCP — デプロイ用サービスアカウント作成

GitHub Actions が GCP を操作するためのアカウント。

```bash
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=YOUR_PROJECT_ID
```

---

## 4. GCP — ロール付与

```bash
SA=github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Cloud Run へのデプロイ権限
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/run.admin"

# Artifact Registry へのイメージ push 権限
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/artifactregistry.writer"

# Cloud Run のランタイム SA になりすます権限（デプロイ時に必要）
gcloud iam service-accounts add-iam-policy-binding \
  YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser"
```

> `YOUR_PROJECT_NUMBER` は `gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)"` で確認。

---

## 5. GCP — Cloud Run ランタイム SA に Firebase 権限付与

Cloud Run 上で Firebase Admin SDK が ADC（Application Default Credentials）経由で動作するために必要。

```bash
RUNTIME_SA=YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/firebase.admin"
```

---

## 5.1 GCP — 匿名化用の閲覧専用 SA（ローカル開発データ生成）

ローカル開発用の匿名化データ（`docs/LocalDevelopment.md` §4.3）を作るときだけ、開発者がこの SA の権限を借りて本番 Firestore を読み取る。**鍵は発行しない**（`gcloud auth application-default login --impersonate-service-account` で借りる）。

```bash
SA=anon-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com

gcloud iam service-accounts create anon-reader \
  --display-name="匿名化用 閲覧専用（ローカル開発データ生成）" \
  --project=YOUR_PROJECT_ID

# 読み取りのみ
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.viewer" --condition=None

# 権限を借りられる開発者
gcloud iam service-accounts add-iam-policy-binding $SA \
  --member="user:DEVELOPER_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=YOUR_PROJECT_ID
```

> 開発用途で本番の SA 鍵を発行しない。ローカル開発は Firebase Emulator だけに接続する（`docs/LocalDevelopment.md`）。

## 6. GCP — Workload Identity Federation 設定

GitHub Actions がキーファイルなしで GCP に認証するための仕組み。

```bash
# プール作成
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --project=YOUR_PROJECT_ID

# プロバイダー作成
# main の deploy.yml 以外のワークフローは、トークンの交換の時点で拒否する（T5-3）
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref" \
  --attribute-condition="assertion.repository == 'YOUR_GITHUB_ORG/YOUR_REPO_NAME' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref.startsWith('YOUR_GITHUB_ORG/YOUR_REPO_NAME/.github/workflows/deploy.yml@')" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project=YOUR_PROJECT_ID

# このリポジトリだけに SA の使用を許可
gcloud iam service-accounts add-iam-policy-binding \
  github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --member="principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO_NAME" \
  --role="roles/iam.workloadIdentityUser"
```

**作成済みの provider に条件を付ける場合:**

```bash
# 今の設定を控える（attributeMapping と attributeCondition）
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --project=YOUR_PROJECT_ID

# 上の create-oidc と同じ --attribute-mapping と --attribute-condition で更新する
gcloud iam workload-identity-pools providers update-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref" \
  --attribute-condition="assertion.repository == 'YOUR_GITHUB_ORG/YOUR_REPO_NAME' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref.startsWith('YOUR_GITHUB_ORG/YOUR_REPO_NAME/.github/workflows/deploy.yml@')" \
  --project=YOUR_PROJECT_ID
```

> - 値は大文字・小文字を区別する。`YOUR_GITHUB_ORG/YOUR_REPO_NAME` は GitHub の表示どおりに書く。
> - 更新したら `main` で deploy を1回動かし、auth のステップが通ることを確かめる。条件に合わないと、auth のステップが `The given credential is rejected by the attribute condition` で失敗する。そのときは `describe` で控えた条件に戻して原因を調べる。
> - Environment `production`（T5-2）を使い始めたら、条件の末尾に ` && assertion.environment == 'production'` を加える。
> - ほかのブランチから deploy できないことの確認は、`docs/Security/SecurityMeasures/T5.md` の「確認方法」の 2・3 で行う。

---

## 7. GitHub Secrets 登録

GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を登録。

| Secret 名 | 取得方法 |
|---|---|
| `GCP_PROJECT_ID` | GCP プロジェクト ID |
| `WORKLOAD_IDENTITY_PROVIDER` | 下記コマンドで確認 |
| `SERVICE_ACCOUNT` | `github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase コンソール → プロジェクト設定 → マイアプリ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | 同上 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | 同上 |
| `SLACK_WEBHOOK_URL` | Slack アプリの Incoming Webhook URL |

**`WORKLOAD_IDENTITY_PROVIDER` の値を確認するコマンド:**

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --project=YOUR_PROJECT_ID \
  --format="value(name)"
```

---

## 8. 動作確認

main ブランチに push/merge すると `.github/workflows/deploy.yml` が実行される。

GitHub Actions の **Actions タブ** で "Deploy to Cloud Run" ジョブが成功することを確認。

デプロイ後の URL は Cloud Run コンソール、または以下で確認:

```bash
gcloud run services describe ryokan-system \
  --region=asia-northeast1 \
  --project=YOUR_PROJECT_ID \
  --format="value(status.url)"
```
