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

## 6. GCP — Workload Identity Federation 設定

GitHub Actions がキーファイルなしで GCP に認証するための仕組み。

```bash
# プール作成
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --project=YOUR_PROJECT_ID

# プロバイダー作成
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project=YOUR_PROJECT_ID

# このリポジトリだけに SA の使用を許可
gcloud iam service-accounts add-iam-policy-binding \
  github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --member="principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO_NAME" \
  --role="roles/iam.workloadIdentityUser"
```

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
