# NormalOperationPlan（★の実装計画）

[NormalOperation.md](NormalOperation.md) の「まだ」のうち、★を付けた5項目を実装する計画。終わった項目は NormalOperation.md の「実装済み」へ移し、この計画からは消す。

## 1. 対象と順番

| 順 | 項目 | NormalOperation の節 | 大きさ | 主に変える場所 |
|---|---|---|---|---|
| 3 | D: ログインのサーバー経由化と、失敗回数の制限 | 入力 | 大 | ログイン画面・API、ブラウザの Firebase SDK の削除、Firestore、CSP、API キー |
| 4 | C: SMS の MFA（サーバー経由の上に作る） | 使う人・場所 | 大 | ログイン画面・API、Firebase の設定 |

## 2. 共通の方針

- 断ったときは、ログに理由のコードを残し、Slack に `[ログイン拒否] アカウント / 理由 / IP / ブラウザと OS / 時刻` を送る（開発者が日々見るのは Slack）。ヘッダーの値は `loginNotice.ts` と同じくエスケープし、生の User-Agent は載せない
- **User-Agent は送る側が自由に書ける。** A は「うっかり別の端末・ブラウザで使った」と「何も考えずに盗んだパスワードを使った」を止めるもので、User-Agent をまねる攻撃者は止められない。その本命は C（MFA）
- 判定のロジックは純粋関数にして `src/lib/auth/` に置き、unit テストで固める。Route はそれを呼ぶだけにする

## 3. A: 端末とブラウザの確認（実装済み）

NormalOperation.md の「端末」「ブラウザ」へ移した。判定は `src/lib/auth/clientCheck.ts` の `checkClient`。今は `verifyIdToken` の後に置いている。D でパスワードの確認をサーバーへ移すときに、パスワードを確かめる前へ移す。

## 4. B: 1アカウント1セッション（実装済み）

NormalOperation.md の「アカウント」へ移した。ログイン API がカスタムクレーム `sessionAuthTime`（`src/constants/auth.ts`）に最後のログインの時刻を書き、`verifySession` が Cookie の `auth_time` と比べる。D でログインをサーバー経由にしても、REST API で得た ID トークンの `auth_time` を同じく書けばよい。

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
