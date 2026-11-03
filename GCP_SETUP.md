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

権限は**対象のリソースにだけ**付ける。プロジェクト全体には付けない（T5-4）。デプロイ用の SA が乗っ取られても、ほかの Cloud Run サービス、ほかのリポジトリ、IAM の設定には届かないようにする。

```bash
SA=github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com
RUNTIME_SA=ryokan-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com  # 実行用の SA。§5 で作る（新しく作る場合は、下の serviceAccountUser の付与は §5 のあとに行う）

# Cloud Run のサービス ryokan-system にだけ、デプロイの権限
# run.developer は公開設定（IAM ポリシー）を変えられない。deploy.yml で --allow-unauthenticated を渡さないのはそのため
gcloud run services add-iam-policy-binding ryokan-system \
  --region=asia-northeast1 \
  --member="serviceAccount:$SA" \
  --role="roles/run.developer" \
  --project=YOUR_PROJECT_ID

# Artifact Registry のリポジトリ ryokan にだけ、イメージの push 権限
gcloud artifacts repositories add-iam-policy-binding ryokan \
  --location=asia-northeast1 \
  --member="serviceAccount:$SA" \
  --role="roles/artifactregistry.writer" \
  --project=YOUR_PROJECT_ID

# 実行用の SA にだけ、それを Cloud Run に割り当てる権限（デプロイ時に必要）
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=YOUR_PROJECT_ID
```

> - Cloud Run のサービスへの付与は、サービスが存在しないとできない。新しく作る場合は、最初の1回だけオーナーが手でデプロイし、公開の設定（`allUsers` に `roles/run.invoker`）もそのときに付ける。

**以前の手順でプロジェクト全体に付けていた場合**は、上を付けたあとに外す（先に外すと、その間のデプロイが失敗する）。

```bash
# 今プロジェクト全体に付いているロールを確認する
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$SA" \
  --format="table(bindings.role)"

# プロジェクト全体の付与を外す
gcloud projects remove-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/run.admin"
gcloud projects remove-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/artifactregistry.writer"
```

---

## 5. GCP — Cloud Run の実行用 SA（ryokan-runtime）

Cloud Run 上の Firebase Admin SDK は、ADC（Application Default Credentials）でこの SA の権限を使う。コンテナが乗っ取られたときに攻撃者が使える権限になるので、**アプリが使う分だけ**を付ける（T6-1）。既定の Compute Engine の SA（`roles/firebase.admin` や Editor を持つことがある）は使わない。

| アプリがすること | 権限 |
|---|---|
| Firestore の読み書き | `roles/datastore.user` |
| ログイン時の Session Cookie の発行（`createSessionCookie`） | `firebaseauth.users.createSession`（カスタムロール） |
| Session Cookie の失効の確認（`verifySessionCookie(cookie, true)` がユーザーを読む） | `firebaseauth.users.get`（カスタムロール） |
| idToken の確認（`verifyIdToken`）、ログ（標準出力） | 不要 |

Firebase Auth は既定のロール（`roles/firebaseauth.admin`）だとユーザーの作成・削除もできるので、カスタムロールにする。乗っ取られても、攻撃者が自分用のアカウントを作れないようにする。

```bash
RUNTIME_SA=ryokan-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com

# SA の作成
gcloud iam service-accounts create ryokan-runtime \
  --display-name="Cloud Run 実行用（ryokan-system）" \
  --project=YOUR_PROJECT_ID

# Firestore の読み書き
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/datastore.user" --condition=None

# Firebase Auth は Session Cookie の発行とユーザーの読み取りだけ（カスタムロール）
gcloud iam roles create ryokanRuntimeAuth \
  --project=YOUR_PROJECT_ID \
  --title="ryokan Runtime Auth" \
  --description="Session Cookie の発行と確認だけ（ユーザーの作成・削除はできない）" \
  --permissions="firebaseauth.users.createSession,firebaseauth.users.get" \
  --stage=GA

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="projects/YOUR_PROJECT_ID/roles/ryokanRuntimeAuth" --condition=None

# デプロイ用の SA が、この SA を Cloud Run に割り当てられるようにする（§4 と同じ）
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=YOUR_PROJECT_ID
```

> - `deploy.yml` が `--service-account=ryokan-runtime@...` を渡す。SA の名前を変えるときは `deploy.yml` の `RUNTIME_SA_NAME` も変える。
> - 切り替えたあと、ログイン・予約の閲覧・保存ができることを本番で確かめる。権限が足りないと、ログインやすべての API が 503 になり、Slack に `PERMISSION_DENIED` などの通知が来る。そのときは、Cloud Run の SA を元に戻して（`gcloud run services update ryokan-system --region=asia-northeast1 --service-account=<元の SA>`）原因を調べる。
> - 動作を確かめたら、既定の Compute Engine の SA から `roles/firebase.admin` を外す（ほかに使っていないことを確かめてから）。

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
> - ほかのブランチから deploy できないことは、適当なブランチに `id-token: write` と `google-github-actions/auth` を使う確認用のワークフローを push し、GCP の認証が失敗することで確かめる（確かめたらブランチを削除する）。

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
