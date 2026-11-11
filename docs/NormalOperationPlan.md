# NormalOperationPlan（★の実装計画）

[NormalOperation.md](NormalOperation.md) の「まだ」のうち、★を付けた5項目を実装する計画。終わった項目は NormalOperation.md の「実装済み」へ移し、この計画からは消す。

## 1. 対象と順番

| 順 | 項目 | NormalOperation の節 | 大きさ | 主に変える場所 |
|---|---|---|---|---|
| 1 | A: User-Agent が Windows でなければ断る | 端末 | 小 | ログイン API |
| 1 | A: 許可するブラウザを決める（全アカウント共通で Chrome か Edge） | ブラウザ | 小 | ログイン API |
| 2 | B: 1アカウント1セッション | アカウント | 小 | ログイン API、`verifySession` |
| 3 | D: ログインのサーバー経由化と、失敗回数の制限 | 入力 | 大 | ログイン画面・API、ブラウザの Firebase SDK の削除、Firestore、CSP、API キー |
| 4 | C: SMS の MFA（サーバー経由の上に作る） | 使う人・場所 | 大 | ログイン画面・API、Firebase の設定 |

## 2. 共通の方針

- 断ったときは、ログに理由のコードを残し、Slack に `[ログイン拒否] アカウント / 理由 / IP / ブラウザと OS / 時刻` を送る（開発者が日々見るのは Slack）。ヘッダーの値は `loginNotice.ts` と同じくエスケープし、生の User-Agent は載せない
- **User-Agent は送る側が自由に書ける。** A は「うっかり別の端末・ブラウザで使った」と「何も考えずに盗んだパスワードを使った」を止めるもので、User-Agent をまねる攻撃者は止められない。その本命は C（MFA）
- 判定のロジックは純粋関数にして `src/lib/auth/` に置き、unit テストで固める。Route はそれを呼ぶだけにする

## 3. A: 端末とブラウザの確認

### 振る舞い

アカウントには結び付けない。どのアカウントでも、Windows の Chrome か Edge なら通す。development・test でも同じく判定する（本番だけの分岐を増やさない）。

| User-Agent | 結果 |
|---|---|
| Windows の Chrome | 通す |
| Windows の Edge | 通す |
| Windows の他のブラウザ（Firefox など） | 403 `client_not_allowed` |
| Windows 以外・ヘッダーなし | 403 `client_not_allowed` |

- Edge の User-Agent には `Chrome/` も入っている。`Edg/` を先に見る（今の `describeUserAgent` と同じ順）。Chrome と Edge のどちらも通すので、ここで判定を誤っても結果は変わらないが、Slack の表示のために分けておく
- ログイン画面の表示: 「この PC・ブラウザからはログインできません。旅館の PC の Chrome か Edge で開いてください」
  - 理由を隠しても、User-Agent は簡単にまねられるので守りは強くならない。スタッフが自分で直せることを優先する
- D の前は `verifyIdToken` の後、`createSessionCookie` の前に置く。D の後はパスワードを確かめる前に移す

### 変える場所

- `src/lib/auth/loginNotice.ts` の `describeUserAgent` から、`parseUserAgent(ua): { browser: 'chrome' | 'edge' | 'other', os: 'windows' | … }` を切り出す。`describeUserAgent` はこれを使って表示を作る
- 新規 `src/lib/auth/clientCheck.ts`: `checkClient(ua): Result<void, 'os_not_allowed' | 'browser_not_allowed'>`。許可する OS とブラウザは `src/constants/` に置く。環境変数は使わない
- `src/app/api/auth/login/route.ts` で `checkClient` を呼ぶ
- `src/hooks/auth/useLogin.ts` で、403 の `client_not_allowed` と時間外の 403 を `error` の値で出し分ける

### テスト

- unit: `parseUserAgent`（Windows・Mac・Android・iOS・Linux の Chrome・Edge・Firefox、空、壊れた値）、`checkClient` の表の全行。fast-check で「どんな文字列でも例外を投げない」
- integration: `tests/integration/api/auth/login/` に、上の表の 403 と、Slack 通知の中身のエスケープ
- fuzz: `tests/integration/fuzz/routes.fuzz.test.ts` で、ログイン API の User-Agent をランダムにする
- e2e:emulator: Playwright の Chromium は Linux の User-Agent を名乗る。`e2e/emulator` の設定で Windows の Chrome の `userAgent` を指定し、1件だけ Linux のまま断られることを確かめる

## 4. B: 1アカウント1セッション

### 振る舞い

- 新しくログインすると、そのアカウントの前のセッションは、次の API の呼び出しから 401 になる（画面は `fetchWithSession` でログイン画面へ移る）
- 前のセッションを置き換えたときは、Slack のログイン通知に「前のセッションを切った」と書く。攻撃者がログインして正しいスタッフが追い出されたら、スタッフが入り直すと攻撃者が追い出され、Slack に2回続けて出る

### Firebase の仕組みで足りるか

Firebase Auth に「1アカウント1セッション」の設定はない。近いのは `revokeRefreshTokens`（そのユーザーのセッションをすべて失効させる）だが、ログイン API で呼ぶと**新しい Cookie まで失効する**。

- 失効の判定は「Cookie の `auth_time` が、ユーザーの `tokensValidAfterTime` より前か」（firebase-admin の `verifyDecodedJWTNotRevokedOrDisabled`）
- `auth_time` は、パスワードを確かめた時刻。Cookie を作り直しても変わらない
- ログイン API で `revokeRefreshTokens` を呼ぶと、`tokensValidAfterTime` が「今」になる。新しい Cookie の `auth_time` は少し前なので、失効扱いになる

### 方法: カスタムクレームに「最後のログインの時刻」を書く

Firebase のユーザーには、アプリが自由に値を書けるカスタムクレームという欄がある（firebase-admin の `setCustomUserClaims`）。Firestore も新しいコレクションも使わない。

- ログイン API: `verifyIdToken` で得た `auth_time` を、`setCustomUserClaims(uid, { sessionAuthTime: auth_time })` で書く。その後に `createSessionCookie`。書けなければ Cookie を返さない（503）
- `verifySession`（`src/lib/auth/verifySession.ts`）: `verifySessionCookie` が通った後に `getUser(uid)` を呼び、`customClaims.sessionAuthTime` と Cookie の `auth_time` が違えば未ログイン（401）
  - 新しいログインがあると `sessionAuthTime` が新しい時刻になるので、前の Cookie は合わなくなる
  - `sessionAuthTime` がない場合も 401 にする（閉じる側に倒す）
  - `getUser` の障害は今と同じく `AUTH_UNAVAILABLE`（503・Slack）
- 置き場所は今の `src/lib/auth/` のまま。層の依存は増えない

### 注意

- `setCustomUserClaims` は**クレームをまるごと置き換える**。今はほかのクレームを使っていないが、足すときは読んでから合わせて書く
- 同じアカウントで同じ秒に2回ログインすると、両方とも通る（`auth_time` は秒単位）。実害はないので扱わない
- API の呼び出しごとに Auth への問い合わせ（`getUser`）が1回増える。`verifySessionCookie(…, true)` も中で `getUser` をしているので、今の1回が2回になる
- デプロイした時点では誰にも `sessionAuthTime` がないので、全員が一度ログアウトされる。時間外（23:00〜6:00）にデプロイすれば、どのセッションも 23:00 で切れているので影響はない

### テスト

- unit: `verifySession` で、時刻が一致・不一致・クレームなし・`getUser` の障害
- emulator: `tests/emulator/` に、2回ログインすると1回目の Cookie が 401 になることを足す（`sessionRevocation.test.ts` の隣）
- e2e:emulator: 2つのブラウザで同じアカウントにログインし、先の方が次の操作でログイン画面へ移ること

## 5. D: ログインのサーバー経由化と、失敗回数の制限

### なぜサーバー経由にするか

今はパスワードをブラウザから Firebase（`identitytoolkit.googleapis.com`）へ直接送っている。間違ったパスワードはこのアプリのサーバーに届かず、攻撃者もブラウザに載っている公開の API キーで Firebase を直接呼べる。サーバー経由にすると次のようになる。

- パスワードの間違いがサーバーを通るので数えられる
- API キーをサーバーだけが持つので、攻撃者は Firebase を直接呼べない。パスワードの総当たりも、SMS を勝手に送らせること（C の後）も、このアプリのサーバーを通るしかない
- パスワードを確かめる前に、時間帯と A を確かめられる。条件に合わないログインでは、Firebase に何も送らない
- ブラウザから Firebase の SDK がなくなり、CSP の `connect-src` から Google の通信先を消せる

### 流れ

1. ブラウザ: メールアドレスとパスワードを `POST /api/auth/login` に送る
2. サーバー: 時間帯 → A → 失敗回数の制限を確かめる
3. サーバー: Firebase Auth の REST API（`accounts:signInWithPassword`）にサーバー用の API キーで送る
4. 失敗なら回数を足して 401。成功なら回数を消し、得た ID トークンで B の `setCustomUserClaims` → `createSessionCookie`

### 失敗回数の制限

- 数える単位は「メールアドレス」と「IP」の2つ。どちらかが上限を超えたら、しばらく 429
  - 案: 15分に5回の失敗で、15分止める。正しいスタッフはパスワードマネージャーの自動入力なので、普段はほぼ間違えない
  - メールアドレスごとだけだと、1つの IP から多くのアドレスを試される。IP ごとだけだと、IP を変えながら1つのアドレスを試される
- 回数は Firestore の新しいコレクション（案: `loginAttempts/{key}`）に置く。Cloud Run はインスタンスが複数になりうるので、メモリでは数えられない
  - key はメールアドレス・IP そのものではなく、ハッシュにする（DB に個人の情報を増やさない）
  - トランザクションで足す。古いドキュメントは Firestore の TTL で消す
  - `gmail-listener` が使っていない名前であることを確かめる
- 429 になったら Slack に通知する。正しいスタッフが止められたときに、開発者が気付けるように
- 存在しないメールアドレスも、正しいアドレスと同じ数え方・同じ応答にする（どのアドレスが本物かを探らせない）
- IP は `X-Forwarded-For` の右端（Google が書いた値）を使う。どの位置が接続元かは、`loginNotice.ts` のとおり本番のログで先に確かめる

### 新しく生まれる弱みと手当て

- **パスワードがサーバーを通る。** リクエストの body をログに出さない。エラーのログにも REST API の応答をそのまま出さない（コードだけにする）
- **Firebase 自身の IP ごとの制限からは、全員がサーバーの IP に見える。** 攻撃されると Firebase がサーバーを止め、正しいスタッフもログインできなくなるおそれがある。こちらの制限を Firebase より厳しくし、攻撃はこちらで先に止める。Firebase の `TOO_MANY_ATTEMPTS_TRY_LATER` は 503 と Slack にする
- ログイン API の入力（メールアドレスとパスワード）の長さを Zod で絞る。Security.md §8「ログイン API での、パスワードの長さの確認」もここで片付く

### API キー

- サーバー用の API キーを新しく作り、使える API を Identity Toolkit だけに絞る。Secret Manager に置き、Cloud Run に渡す
- 今ブラウザに載っている API キー（`NEXT_PUBLIC_FIREBASE_API_KEY`）は、切り替えた後に消す
  - 消す前に、`gmail-listener` など、ほかにこのキーを使っているものがないか確かめる

### 消すもの

- ブラウザの Firebase SDK（`src/lib/firebase/client.ts`、`firebase` パッケージ）。ブラウザから Firebase を一切呼ばなくなる
- `NEXT_PUBLIC_FIREBASE_*` の環境変数と、`runtimeEnvGuard.ts` のうちブラウザ側の Emulator の確認（`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` など）。ガードは緩めず、サーバー側の確認はそのまま残す
- `src/lib/csp.ts` の `connect-src` の `identitytoolkit.googleapis.com` と `securetoken.googleapis.com`

### 先に試すこと（スパイク）

- [ ] REST API の `accounts:signInWithPassword` が Auth Emulator でも同じ形で動くか（開発と E2E で使う）
- [ ] REST API でも MFA のサインイン（`accounts/mfaSignIn:start`・`finalize`）が呼べるか。reCAPTCHA の token が要るか（C の作りがここで決まる）

### テスト

- unit: 失敗回数の判定（上限の手前・ちょうど・超えた後・期限が過ぎた後）、IP の取り出し
- integration: ログイン API の 400（長すぎる入力）、401、429、503、Slack 通知。body の値がログに出ないこと
- fuzz: ログイン API の body と `X-Forwarded-For`
- emulator: 回数のトランザクション（同時に失敗したとき数え漏れがないこと）
- e2e: ログイン画面（API はモック）
- e2e:emulator: 本物のログインと、6回目の失敗の 429
- e2e:prod: CSP を変えたので、攻撃を止める検査が今も通るか

## 6. C: SMS の MFA

D のサーバー経由のログインの上に作る。

### 流れ（D の後）

1. ブラウザ: メールアドレスとパスワードを送る
2. サーバー: D の確認を通った後、`signInWithPassword` が「2要素目が要る」と返す → `mfaSignIn:start` でフロントの電話に SMS を送る → ブラウザに「コードを入力」と返す
3. ブラウザ: コードを `POST /api/auth/login/verify` に送る
4. サーバー: `mfaSignIn:finalize` → 得た ID トークンで `createSessionCookie`
5. **サーバーで、ID トークンが2要素目を通ったものか確かめる**（decoded token の `firebase.sign_in_second_factor`）。MFA を登録していないアカウントがあっても、ここで止まる

- 2 と 3 の間の途中の状態（Firebase から受け取る `mfaPendingCredential` など）の置き場所を決める。案: Firestore に数分で切れるドキュメントを置き、ブラウザには推測できない ID を HttpOnly の Cookie で渡す
- SMS の送信もサーバーで数える。案: 1アカウント1日10通まで。超えたら 429 と Slack
- コードの入力の失敗も、D の失敗回数と同じように数える

### コードの外の準備（先に始める）

- [ ] Firebase Authentication の Identity Platform への切り替え（SMS の MFA に必要。課金が変わる）
- [ ] SMS の送り先の地域を日本だけにする（SMS pumping、つまり不正な大量送信で料金を取られるのを防ぐ）
- [ ] 料金の見積もり。セッションは毎日 23:00 で切れるので、少なくとも「PC の台数 × 1日1回」の SMS が出る
- [ ] フロントに置く電話の用意。電話番号1つを3つのアカウントすべてに登録できるか確かめる
- [ ] 電話をなくした・電池が切れたときの手順（開発者が登録を変える。その間はログインできない）

### 登録の方法

- 登録の画面は作らない。firebase-admin の `updateUser` で電話番号を2要素目として登録するスクリプトを `scripts/` に置き、**ユーザーが本番に対して実行する**（AI エージェントは実行しない）
- 登録の条件（メールアドレスの確認済みなど）を、Context7 か公式ドキュメントで確かめる

### 先に試すこと（スパイク）

- [ ] D のスパイクで、`mfaSignIn:start` に reCAPTCHA の token が要ると分かった場合: ブラウザで reCAPTCHA を動かして token をサーバーへ送ることになる。今の CSP と `Cross-Origin-Embedder-Policy: require-corp`（`proxy.ts`）で Google の iframe・スクリプトが動くか。動かないときの候補は、`/login` だけ COEP を外す、または `credentialless` にする
- [ ] Auth Emulator が SMS の MFA に対応しているか。コードをどう取り出すか（E2E と `make` で使う）
- [ ] SMS が届くまでの時間（朝のログインが遅くならないか）

### 変える場所

- `src/hooks/auth/useLogin.ts`: 2段目（コードの入力）の状態を足す
- `src/app/login/page.tsx`: コードの入力欄と再送
- `src/app/api/auth/login/route.ts` と新しい `src/app/api/auth/login/verify/route.ts`
- reCAPTCHA が要るときだけ: `src/lib/csp.ts`、`src/proxy.ts`、`tests/unit/lib/csp.test.ts`

### テスト

- unit: `useLogin` の2段目（コードの誤り、期限切れ、再送、SMS の送信の失敗）
- integration: 2要素目のない ID トークンを 403 にすること、途中の状態の期限切れ、SMS の通数の上限
- e2e: ブラウザ側のモックで2段目の画面
- e2e:emulator: Emulator が対応していれば、本物の流れ

## 7. 終わったら更新するもの

- [NormalOperation.md](NormalOperation.md): 項目を「実装済み」へ
- [Security.md](Security.md): §7（対策）、§8（未着手から「SMS による MFA」「ログインのサーバー経由化と、API キーのサーバー専用化」「ログインの失敗回数の制限」「ログイン API での、パスワードの長さの確認」を消す）、§10
- [Domain.md](Domain.md): Firestore のデータ構造に `loginAttempts` と MFA の途中の状態
- [Development.md](Development.md): サーバー用の API キーと Secret Manager、Identity Platform の設定、MFA の登録スクリプトの使い方、消した `NEXT_PUBLIC_FIREBASE_*`
- `AGENTS.md`: 「ブラウザの Firebase SDK は Auth だけ」（壊してはいけないもの 6）を「ブラウザは Firebase を呼ばない」に。アーキテクチャの「ブラウザ: Auth のみ」。InfraError のコードを足したときは表を
- `scripts/localdev/`: 新しいコレクションをデータ投入・匿名化で扱う必要があるか
