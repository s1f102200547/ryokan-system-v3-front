# Deploy Guide

> 設計途中：local / staging / production の切り替え方法は検討中

## Overview

完全自動デプロイ（merge 駆動）を前提とした構成。

## Standard Flow

1. feature branch で開発
2. Pull Request 作成
3. GitHub Actions が自動実行
   - lint
   - typecheck
   - unit test
   - E2E test
   - npm audit
   - OWASP ZAP Baseline Scan（パッシブスキャンのみ、約1〜2分）
   - いずれか失敗時に Slack `#ryokan-alerts` へ通知
4. すべて成功した場合のみ merge 可能
5. main に merge すると以下が自動実行
   - Docker build
   - Cloud Run へデプロイ（production）
   - Slack `#ryokan-ops` へデプロイ完了通知

## Environments

3 環境を明確に役割分離する。

| Environment | Trigger    | 用途 | 特徴                         |
| ----------- | ---------- | ---- | ---------------------------- |
| production  | main merge | 本番 | 実 DB・フル認証               |
| staging     | PR 作成    | 検証 | 本番相当・一時環境・自動削除  |
| local       | 手動起動   | 開発 | ローカル DB・高速開発・モック可 |

## Staging Lifecycle

- PR 作成時 → 自動デプロイ
- PR 更新時 → 自動更新
- PR クローズ時 → 自動削除

## Local Environment

開発はローカル環境で完結。
```bash
npm run dev
```

## OWASP ZAP スキャン

| スキャン種別 | タイミング | 方式 | 対象 |
|---|---|---|---|
| Baseline Scan（パッシブ） | PR ごとの CI | 自動 | ログイン画面・主要 API エンドポイント |
| フルスキャン | 週次 cron | 別ジョブ | 同上 |

PR CI にフルスキャンを含めると 10〜30 分かかるため分離する。

## Branch Protection

**ルール**

- main への直接 push 禁止
- PR 経由のみ
- CI 全成功を必須条件

**意図**

- 人ではなく CI を信頼する
- 小規模開発でも品質担保