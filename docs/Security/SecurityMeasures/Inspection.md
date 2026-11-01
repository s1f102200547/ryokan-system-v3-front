# 検査と継続的な点検

| 項目 | 内容 | 効く脅威 | 段階 |
|---|---|---|---|
| SAST | Semgrep を CI に追加する（T7-1） | T7 | P1 |
| 秘密情報の検査 | gitleaks を CI に追加する（T8-1） | T8 | P1 |
| ZAP の full scan | CI の中で起動したサーバーに対して実行する（本番には実行しない）。`docs/KnownIssues.md` の「full モードを試していない」への対応。ログイン後の画面の検査は、端末登録のあとに検討する | T6、T7 | P1 |
| ASVS 5.0 L1 の棚卸し | 年1回、`docs/Security/` の文書と実装を ASVS L1 の項目と突き合わせる | 全般 | 継続 |
| KnownIssues の古い記述 | 「CI が通らなくても deploy される」は、`deploy.yml` の `conclusion == 'success'` で解消済みの可能性がある。確認して更新する | — | P1 |
