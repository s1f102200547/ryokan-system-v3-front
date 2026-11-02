# Local Development 仕様（Firebase Emulator）

## 1. 目的

- ローカル開発から本番の Firestore / Auth に **到達できる経路をなくす**。
- 開発者の PC に **本番の認証情報を常駐させない**。PC 内のファイルを不正に見られても、本番の環境とデータには届かない状態にする（匿名化の実行中を除く。§5 参照）。
- 開発用データは **本番と同じ形**（キーの欠損、型違い、`''` と `null` の混在、壊れた値）を持ち、**個人を特定できない** ものにする。壊れた値は直さずに残し、壊れたデータが来ても正しく対処できるコードかを試せるようにする。

## 2. 用語

| 用語 | 意味 |
|---|---|
| Emulator | Firebase Emulator Suite（Firestore + Auth） |
| demo project | `demo-` で始まる project ID（例: `demo-ryokan`）。Emulator 専用で、本番リソースに届かない。Firebase コンソールでの作成は不要 |
| Emulator 系の環境変数 | Firestore Emulator / Auth Emulator の接続先を指定する環境変数 |
| 匿名化データ | 本番から機械的に生成した、元に戻せない開発用データ |
| 形 | フィールドの有無、型、`''` / `null` の区別、破損値。値の中身は含まない |
| 閲覧専用 SA | `roles/datastore.viewer` のみを持つ、匿名化専用のサービスアカウント |

## 3. 全体の流れ

```
本番 Firestore ──(閲覧専用SA, 読み取りのみ)──> 匿名化 ──(メモリ上で変換)──> 匿名化データ（ローカル）
                                                                              │
Emulator (demo project) <──────────────────── 投入（値は変えない）─────────────┘
       ↑
  開発サーバー
```

## 4. 要件

### 4.1 開発サーバーの接続先（DEV）

| ID | 要件 |
|---|---|
| DEV-1 | 開発サーバーは Emulator（Firestore + Auth）にだけ接続する |
| DEV-2 | サーバー側は、development のとき次をすべて満たさなければ **起動を拒否** する<br>・Firestore Emulator の接続先が設定されている<br>・Auth Emulator の接続先が設定されている<br>・サーバー側の project ID が `demo-` で始まる<br>・ブラウザ側の project ID がサーバー側と一致する（ずれるとトークン検証が分かりにくい形で失敗する）<br>・本番の認証情報（サービスアカウント鍵、鍵ファイルのパス）が設定されていない |
| DEV-3 | Emulator 接続時のサーバー側は、認証情報を渡さずに初期化する。本番用の初期化経路（鍵による初期化、ADC への fallback）は development では通らない |
| DEV-4 | ブラウザ側の Auth も Auth Emulator に接続する（サーバーとブラウザで接続先を揃えないと、トークンの検証が失敗する）。Auth のインスタンスと Emulator への接続処理は1か所に集約し、Auth を使う箇所はすべてそこを経由する |
| DEV-5 | CSP の `connect-src` には **development のときだけ** Auth Emulator のアドレスを加える。production の CSP は変えない |
| DEV-6 | 開発用の環境設定に本番の鍵を置かない |
| DEV-7 | E2E は Emulator 系の環境変数と demo project ID を設定して開発サーバーを起動し、DEV-2 を通す。API はブラウザ側でモックするため、Emulator 本体は起動しない。CI も同じ方式とする |

### 4.2 本番側のガード（PROD）

| ID | 要件 |
|---|---|
| PROD-1 | production で Emulator 系の環境変数が1つでも設定されていれば、**起動を拒否** する。Admin SDK は Auth Emulator の接続先があるとトークンの署名を検証しないため、誤って本番に入ると認証を素通りされる |
| PROD-2 | production で project ID が `demo-` で始まれば、起動を拒否する |

### 4.3 匿名化（ANON）

#### 実行条件

| ID | 要件 |
|---|---|
| ANON-1 | 匿名化は開発者の PC で実行する。本番の読み取りは閲覧専用 SA の権限を借りて行い、鍵ファイルは作らない |
| ANON-2 | ログインは匿名化の実行時だけ行う。実行中は、権限を借りる元である開発者本人の認証情報（本番の Owner 相当）が PC に載る。これは受容するリスクとする（§5） |
| ANON-3 | 終了時（正常終了・エラー・中断）に、PC 上の本番の認証情報を削除する。削除の対象は次のすべて<br>・gcloud のユーザー認証（`gcloud auth revoke` で取り消す）<br>・ADC（`gcloud auth application-default revoke` で取り消し、`application_default_credentials.json` が残っていないことを確認する）<br>・Firebase CLI のログイン（ログインしていた場合は `firebase logout`） |
| ANON-4 | 開始時にも、前回の認証情報が残っていないかを確認して削除する（強制終了や電源断で ANON-3 が働かなかった場合の補完）。対象は ANON-3 と同じ |
| ANON-5 | Emulator 系の環境変数が設定された環境では実行を拒否する（Emulator を本番と取り違えないため） |
| ANON-6 | 本番に対しては読み取りだけを行う。対象は全件とする（形のレポートの網羅性のため） |
| ANON-7 | 変換はメモリ上で行い、**ディスクに書くのは匿名化後のデータだけ** にする。生データの一時ファイルも作らない |
| ANON-8 | 匿名化データの出力先はリポジトリ内の1か所に固定し、**Git の管理対象にも、コンテナイメージなどのデプロイ成果物にも含めない**。コミットするのは生成手段だけにし、いつでも作り直せるようにする |
| ANON-12 | **実行中は AI エージェント（Claude Code、Codex など）を動かさない**。実行中は PC に本番の認証情報が載り、本番の生データがメモリにある。エージェントがファイルやコマンドの出力を読むと、それがエージェントの会話（外部のサービス）に渡るおそれがある。実行の前にエージェントを終了し、終了時の後片付け（ANON-3）が済んでから再開する（T8-3） |

#### 変換規則

**許可リスト方式** とする。下表で **コレクション名付きのパスで列挙されたフィールドだけ** がその扱いを受け、それ以外は未知のフィールドも含めてすべてマスクする。表に「など」は使わない。`gmail-listener` が新しいフィールドを追加しても、個人情報が素通りしない。

- パスの書き方: `コレクション名.フィールド名`。マップの中は `.`、配列の各要素は `[]` でつなぐ（例: `guestInfoV2.mail_memo[].source`）。
- 同じ名前でもパスが違えば別のフィールドとして扱う（例: `guestInfoV2.source` は残すが、`dailyInfo.source.path` はマスクする）。

**guestInfoV2**

| 扱い | 対象フィールド |
|---|---|
| 残す | `check_in_date`, `check_out_date`, `room`, `adult_count`, `child_count`, `room_count`, `cancel`, `late_out`, `booking_site`, `room_type`, `stay_plan`, `total_price`, `source`, `arrival_time`, `dinner_time`, `breakfast_time`, `open_air_bath_time`, `group_type`, `purpose`, `tourism_type`, `age_groups`, `a_tax_received`, `mail_memo[].month`, `mail_memo[].day`, `mail_memo[].source` |
| ID として振り直す | ドキュメント ID, `reservation_number`, `mail_id` |
| シャッフル | `country` |
| マスク | 上記以外すべて（例: `guest_name`, `city`, `remarks`, `payment`, `profession`, `other_note`, `timetable_info`, `dinner_info`, `check_in_staff_name`, `a_tax_received_by_staff_name`, `mail_memo[].name`, `mail_memo[].summary`, `mail_memo[].text`, 未知のフィールド） |

**dailyInfo**

| 扱い | 対象フィールド |
|---|---|
| 残す | ドキュメント ID, `date`, `updated_at`, `migrated_at`, `source.collection`, `source.field` |
| ID として振り直す | `todos[].id` |
| マスク | 上記以外すべて（例: `safeBalanceChecker`, `todos[].text`, `CleaningBoardUserNotes`, `source.path`, 未知のフィールド） |

**共通**

- 日付は **ずらさない**。破損した日付も含めて値をそのまま残す。
- 部屋番号（`room`）は値をそのまま残し、シャッフル・マスク・付け替えをしない。予約ごとに値が変わると、本番にはないダブルブッキングが生まれる。
- `country` のシャッフルは `guestInfoV2` の全レコードの間で行い、`null` と `''` もシャッフルの対象に含める（分布を保つ）。
- Timestamp など Firestore 固有の型は、型を保ったまま上の扱いを適用する。

#### ID の振り直し

- 乱数で振り直す。同じ実行内では、同じ元の値は同じ新しい値に対応させる（コレクションをまたいだ参照関係を保つ）。

#### マスク

| 元の値 | マスク後 |
|---|---|
| 文字列 | 1文字ずつ、下の「文字の種類」が同じ乱数の文字に置き換える。文字数は保つ |
| 数値 | 同じ桁数の乱数。整数か小数か、符号を保つ。`0` は `0` のまま |
| `NaN`, `Infinity` | そのまま |
| `''`, `null`, 真偽値 | そのまま |
| 配列、マップ | 要素ごとに再帰的に適用する |

文字の種類（全角と半角は別の種類として扱い、印刷時の文字幅を保つ）:

| 元の文字 | 置き換え先 |
|---|---|
| 半角数字 / 全角数字 | 同じ幅の数字 |
| 半角英字 / 全角英字 | 同じ幅・同じ大文字小文字の英字 |
| ひらがな | ひらがな |
| 全角カタカナ / 半角カタカナ | 同じ幅のカタカナ |
| 漢字 | 小学1年の教育漢字（80字。すべて常用漢字）から乱数で選ぶ。元の字の推定に使えないよう、字の種類は少なくてよい |
| 上記以外の文字（アクセント付きラテン文字、ハングルなど） | 半角なら半角英字、全角なら漢字 |
| 空白、改行、記号（ASCII 記号、全角記号、句読点）、絵文字 | **置き換えずにそのまま残す**（印刷レイアウトの確認に必要） |

- ハッシュは辞書攻撃で戻せるため使わない。

#### 出力

| ID | 要件 |
|---|---|
| ANON-9 | 匿名化データには **匿名化した日** を記録する |
| ANON-10 | 実行のたびに **形のレポート** を出力する。内容はコレクション・フィールドごとの型の件数（`string` / `number` / `null` / `''` / 欠損 / 破損日付 など）だけで、値は含めない |
| ANON-11 | 前回のレポートをローカルに保存しておき、型の種類が増えたフィールドを警告する（本番データの形が変わった合図） |
| ANON-13 | 実行のたびに **大きさのレポート**（`.localdev/reports/size-latest.json`）を出力する。内容はフィールドごとの文字列の最大長（UTF-16 の length。Zod の `.max()` と同じ数え方）と配列の最大件数だけで、値は含めない。API の入力の上限を決めるのに使う（T7-4）。ID の振り直しやシャッフルで文字数が変わるので、形のレポートとは分ける |

形のレポートで「破損日付」として数える基準（値は変えず、数えるだけに使う）:

| フィールド | 正常な日付 |
|---|---|
| `guestInfoV2.check_in_date`, `guestInfoV2.check_out_date` | `YYYY/MM/DD` で、暦の上で実在する日付 |
| `dailyInfo` のドキュメント ID, `dailyInfo.date` | `YYYY-MM-DD` で、暦の上で実在する日付 |
| `dailyInfo.updated_at`, `dailyInfo.migrated_at` | ISO 8601 で、暦の上で実在する日時 |
| `guestInfoV2.mail_memo[].month` + `day` | 月が `"1"`〜`"12"`、日が `"1"`〜`"31"` の文字列で、その月に実在しうる日（2月は29日まで可） |

上の基準に合わない文字列（例: `2026-13-99`、`check_in_date` の `2026-01-05` のような書式違い）を破損日付として数える。

### 4.4 Emulator への投入（SEED）

| ID | 要件 |
|---|---|
| SEED-1 | Emulator 系の環境変数が設定され、かつ project ID が `demo-` で始まる場合だけ実行する。満たさなければ何もせず終了する |
| SEED-2 | 投入前に Emulator の全データと全ユーザーを削除する |
| SEED-3 | 匿名化データの値を変えずに投入する。日付もずらさない。アプリの表示範囲（今日から過去100日〜未来365日）の外にあるデータもそのまま投入する |
| SEED-4 | Emulator 専用の開発用ログインユーザーを作る |

### 4.5 運用（OPS）

| ID | 要件 |
|---|---|
| OPS-1 | 匿名化データは月1回程度、およびリリース前に作り直す |
| OPS-2 | 本番の書き込み権限を持つ鍵で、開発用途に使っていたものは無効化する。PC に本番の鍵を置かない |
| OPS-3 | PC から本番へデプロイするときは、その都度ログインし、終わったらログアウトする。PC からデプロイしない場合は、ログアウトした状態を保つ |
| OPS-4 | 普段の PC には、gcloud・Firebase CLI のどちらにも本番の認証情報が残っていない |
| OPS-5 | 匿名化データは開発者のローカル以外に渡さない |

## 5. 受容するリスク

| リスク | 理由 | 緩和策 |
|---|---|---|
| 匿名化の実行中（数分間）、開発者本人の本番 Owner 相当の認証情報が PC に載る | 実行は月1回程度で、Cloud Shell などで実行する運用より手間が少ない | ANON-3, ANON-4, OPS-4 |
| 日付を本物のまま残すため、日付・部屋・人数・国の組み合わせから、小さな旅館では個人を推定できる可能性がある | 破損した値を含めて本番の形をそのまま再現するため。日付をずらしても、既知の予約が1件あればずらした日数を割り出せるので、守りとしては弱い | `country` のシャッフル、`city` のマスク、OPS-5、ANON-8 |
| 小数として保存された整数値（`1.0`）が、投入後に整数（`1`）になる | Firestore の Node SDK は、整数として表せる数値を整数として書き込み、小数として書く指定ができない。アプリは JS の number として読むので影響しない | 形のレポートでは、元が小数だったことを記録する（匿名化は `useBigInt` で読む） |

## 6. 受け入れ基準

| ID | 基準 | 対応要件 |
|---|---|---|
| AC-1 | Emulator 系の環境変数を外すと、開発サーバーの起動が拒否される | DEV-2 |
| AC-2 | project ID を `demo-` 以外にすると、開発サーバーの起動が拒否される | DEV-2 |
| AC-3 | ブラウザ側とサーバー側の project ID がずれていると、開発サーバーの起動が拒否される | DEV-2 |
| AC-4 | 本番の鍵や鍵ファイルのパスを設定すると、開発サーバーの起動が拒否される | DEV-2 |
| AC-5 | ADC がログイン済みの PC でも、開発サーバーが本番に接続しない | DEV-3 |
| AC-6 | 開発用ユーザーでログインでき、予約一覧に匿名化データが表示される | DEV-1, DEV-4, DEV-5, SEED-4 |
| AC-7 | 画面での保存・キャンセル・追加が Emulator にだけ反映される | DEV-1 |
| AC-8 | production の CSP に Emulator のアドレスが含まれない | DEV-5 |
| AC-9 | Emulator 本体を起動しない CI で E2E が通る | DEV-7 |
| AC-10 | production で Emulator 系の環境変数を1つ設定すると、起動が拒否される | PROD-1 |
| AC-11 | production で `demo-` の project ID を設定すると、起動が拒否される | PROD-2 |
| AC-12 | 匿名化の終了後（正常終了・エラー・中断）、gcloud のユーザー認証、ADC、Firebase CLI のログインのどれも PC に残っていない | ANON-3 |
| AC-13 | 認証情報を残した状態で匿名化を開始すると、まずそれが削除される | ANON-4 |
| AC-14 | Emulator 系の環境変数が設定された環境で、匿名化が拒否される | ANON-5 |
| AC-15 | 匿名化の途中で、匿名化前のデータがディスクに書かれない | ANON-7 |
| AC-16 | 匿名化データが Git の管理対象にもコンテナイメージにも含まれない | ANON-8 |
| AC-17 | 許可リストにないフィールドを含むテストデータを匿名化すると、そのフィールドがマスクされる | 変換規則 |
| AC-18 | 名前が同じでもパスが違うフィールド（`guestInfoV2.source` と `dailyInfo.source.path`）が、それぞれの規則で扱われる | 変換規則 |
| AC-19 | 日付（破損した日付を含む）と部屋番号が、匿名化と投入の後も元の値のまま残る | 変換規則, SEED-3 |
| AC-20 | マスク後の文字列で、文字数・全角半角・空白・改行・記号が元と同じ | マスク |
| AC-21 | 振り直した ID で、コレクション間の参照関係が保たれる | ID の振り直し |
| AC-22 | 匿名化データに匿名化した日が記録されている | ANON-9 |
| AC-23 | 形のレポートに値が含まれず、書式違い・実在しない日付を含むテストデータで、破損日付の件数が正しく数えられる | ANON-10 |
| AC-24 | フィールドの型の種類を増やしたテストデータで、警告が出る | ANON-11 |
| AC-25 | Emulator 系の環境変数がない環境で、投入が拒否される | SEED-1 |
| AC-26 | 2回続けて投入しても、データが重複しない | SEED-2 |
| AC-27 | 普段の PC で、gcloud・Firebase CLI のどちらにも本番の認証情報がない | OPS-4 |

## 7. 発展

- 匿名化データ全件をデータ読み込み処理（Infra 層のパーサー）に通すテストを置き、「実際のデータの形」を判定基準にする（`docs/BugHunting.md`）。

## 8. 実装（2026-10-31 時点）

### 8.1 使い方

前提: Node.js 24 と、それに付属の npm 11（CI・Docker と同じ。npm 12 は入れない）。依存は `npm ci` で入れる。`.npmrc` の設定で、公開から7日たっていない版は入らず、`package.json` の `allowScripts` にない install スクリプトがあると失敗する（`docs/CICD.md`「依存のインストール」）。

```bash
cp .env.development.example .env.development   # 初回のみ。本番の鍵は置かない（置くと起動が拒否される）
make          # Emulator 起動 → データ投入 → 開発サーバー（http://127.0.0.1:3000）。Ctrl+C で全部止まる
```

- ログイン: `dev@example.com` / `dev-password`（Emulator 専用の固定値）。
- 投入するデータ: `.localdev/data/` に匿名化データがあればそれ、なければ人工データ（`tests/fixtures/localdev/`）。
- Emulator は停止するとデータとユーザーを失う。`make` は毎回投入し直す。古い Session Cookie で開くと API が 401 を返し、ログイン画面に移る。
- 匿名化データの作り直し（月1回程度とリリース前。OPS-1）: `make anonymize`（= `npm run anonymize -- --project ryokan-system --sa anon-reader@ryokan-system.iam.gserviceaccount.com`）。ブラウザでログインし、終了時に認証情報が削除される。**実行の前に AI エージェントを終了しておく**（ANON-12）。
- 個別に動かす場合: `npm run emulators` / `npm run seed [-- --fixture]` / `npm run dev`。Firebase CLI（`firebase-tools`）と Java が必要。

### 8.2 構成

| 要件 | 実装 |
|---|---|
| DEV-2, PROD-1, PROD-2 | `src/lib/firebase/runtimeEnvGuard.ts`（判定。純粋関数）、`src/instrumentation.ts` → `enforceRuntimeEnv.ts`（起動時に検査し、違反なら `process.exit(1)`）、`src/constants/runtimeEnv.ts`（変数名） |
| DEV-3 | `src/lib/firebase/admin.ts`: development / test は `initializeApp({ projectId })`、production は ADC。鍵での初期化はない |
| DEV-4 | `src/lib/firebase/client.ts` の `getFirebaseAuth()`。Auth はすべてここを経由する |
| DEV-5 | `src/lib/csp.ts` の `buildCsp()`。development のときだけ Auth Emulator を `connect-src` に加える |
| DEV-7 | `playwright.config.ts` の `webServer.env`（ローカルと CI で同じ） |
| SEED-* | `scripts/localdev/seed.ts`、`scripts/localdev/lib/guards.ts`（`checkSeedTarget`） |
| ANON-1〜5 | `scripts/localdev/anonymize.sh`（認証の取得と後片付け） |
| ANON-6〜11、変換規則 | `scripts/localdev/anonymize.ts`、`scripts/localdev/lib/`（`allowlist` / `mask` / `idRemap` / `shuffle` / `transform` / `shapeReport` / `dateValidity` / `serialize`） |
| Emulator | `firebase.json`（すべて `127.0.0.1`）、`.firebaserc`（`demo-ryokan`） |

環境変数:

| 変数 | development | test（Vitest） | production |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` / `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `demo-ryokan`（一致必須） | `demo-test` | `demo-` 始まりは拒否 |
| `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:8080` / `127.0.0.1:9099`（必須） | `127.0.0.1:1`（到達不能） | 設定すると拒否 |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099`（サーバー側と一致必須） | `127.0.0.1:1` | 設定すると拒否 |
| `FIREBASE_PRIVATE_KEY` など本番の認証情報（名前に `PRIVATE_KEY` を含む変数を含む） | 設定すると拒否 | 設定すると拒否 | 見ない（Cloud Run は ADC） |

### 8.3 実装上の決定

仕様に書かれていなかった点や、実装中に分かった点。

- **起動拒否はプロセスを終了させる。** `register()` で throw するだけでは、`next start` / standalone の `server.js` は全リクエストに 500 を返したまま待ち受けを続け、Cloud Run が起動成功と見なす。
- **`NEXT_PUBLIC_*` は build 時にインライン化される** ため、起動ガードでは変数名を直接書いて参照する（`process.env` の走査では production で見えない）。
- **Emulator 接続時、Admin SDK は ADC を読まない**（Auth は `owner` トークン、Firestore は insecure channel）。開発 PC に ADC が残っていても本番に届かない。
- **ブラウザの Auth は最初に使うときに初期化する。** 読み込み時に `getAuth()` を呼ぶと、API key のない build や SSR で失敗しうる。
- **Vitest は到達不能な Emulator を向く**（`vitest.config.ts` の `test.env`）。Infra を実際に動かすテストを書いても、本番にも ADC にも届かない。
- **開発サーバーと Emulator は `127.0.0.1` にだけ bind する。** 開発用ユーザーのパスワードが固定値のため。E2E の URL と Cookie も `127.0.0.1` に揃える。
- **E2E は実際のアカウントを使わない。** ログイン後の画面はモックの Session Cookie と `page.route` で表示する。
- **投入はローカルの Emulator（`127.0.0.1` / `localhost` / `[::1]`）にだけ行う。** 全データを消す処理なので、仕様（SEED-1）に加えて接続先も確かめる。
- **保存形式はタグ付き JSON**（`scripts/localdev/lib/serialize.ts`）。integerValue（BigInt）、`NaN` / `Infinity` / `-0`、Timestamp、GeoPoint、Reference、Bytes を保つ。匿名化の読み取りは `useBigInt: true`。
- **変換は保存形式に対する純粋関数**（`anonymizeCollections`）。乱数は注入する（本番は `node:crypto`、テストは固定シード）。
- **ID の対応表は1つで、全コレクションで共有する。** UUID は UUID v4、それ以外は同じ長さ・同じ文字の種類の乱数。`''` と `null` は振り直さない。
- **マスクの細部:** Timestamp はそのまま、GeoPoint は (0, 0)、Bytes は同じ長さの乱数、Reference はパス中の ID だけ振り直す。小数は整数部と小数部の桁数をそれぞれ保つ。`々 〆 ー ｰ ﾞ ﾟ ゝ ゞ ヽ ヾ` とキーキャップ絵文字の数字は記号として残す。「上記以外の文字」の全角判定は East Asian Width の F / W の主な範囲。
- **`country` のシャッフルでは、キー欠損のレコードは欠損のまま残す。**
- **マップのキー（フィールド名）はマスクしない。** 個人情報をキーにしたマップがあると漏れる。形のレポートで「新しいフィールド」の警告が出たら中身を確認する。
- **匿名化しても形のレポートは変わらない**（fixture で unit test）。レポートはフィールドも種類も並び順を固定する。

### 8.4 受け入れ基準の確認状況

| AC | 状態 | 確認方法 |
|---|---|---|
| AC-1〜4, AC-10, AC-11 | 確認済み | unit test + 実際の起動（`next dev` / `next start` / standalone `server.js`） |
| AC-5 | 確認済み | ADC ログイン済みの PC で、ブラウザの外向き通信が `127.0.0.1:9099` だけ |
| AC-6, AC-7 | 確認済み | 開発用ユーザーでログインし、画面からの保存・キャンセル・追加が Emulator にだけ反映 |
| AC-8 | 確認済み | unit test + production のレスポンスヘッダー |
| AC-9 | ローカルで確認済み | `CI=1` で E2E 全件。CI 上での確認は PR で行う |
| AC-12, AC-13 | 確認済み（エラー・Ctrl+C の経路） | gcloud の設定を一時ディレクトリに向け、ログインを代役に差し替えて実行。正常終了の経路は本番での実行で確認する |
| AC-14, AC-25 | 確認済み | unit test + 実行 |
| AC-15 | 確認済み | 目印の文字列を入れたデータで実行し、実行中に書かれたファイルを列挙して検索 |
| AC-16 | 確認済み | `git check-ignore` + ダミーの `.localdev/` を置いた `docker build` |
| AC-17〜24 | 確認済み | unit test（`tests/unit/localdev/`） |
| AC-26 | 確認済み | 2回続けて投入して件数比較 |
| AC-27 | 確認済み | `gcloud auth list` / ADC ファイル / `firebase login:list` |

