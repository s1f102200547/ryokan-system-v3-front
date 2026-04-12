# TimeTable 仕様書

## 概要

TimeTable は旅館スタッフ向けの日次業務シートです。  
指定日の様々なゲスト情報を1画面に集約し、１枚の紙として印刷して使用します。
必要な予約情報はroomState.tsを元にします。
表のUIは`reference/v2/TimeTable/*`を参考にしてください

---

## 対象部屋

```js
// src/constants/constants.js
const ROOM_MAP = {
  "21": "㉑", "22": "㉒",
  "31": "㉛", "32": "㉜",
  "42": "㊷", "43": "㊸",
  "61": "61",
};
```
---

## Firestoreのデータ構造（予約1件）

| フィールド | 型 | 説明 |
|---|---|---|
| `room` | string/number | 部屋番号（例: `"21"`, `21`） |
| `guest_name` | string | 宿泊者名 |
| `check_in_date` | string | `"YYYY/MM/DD"` 形式 |
| `check_out_date` | string | `"YYYY/MM/DD"` 形式 |
| `adult_count` | number | 大人人数 |
| `child_count` | number | 子供人数 |
| `arrival_time` | string | 到着予定時刻（例: `"16:00"`） |
| `dinner_time` | string[] | 夕食時刻の配列（宿泊日数分）。各要素は後述の値 |
| `breakfast_time` | string[] | 朝食時刻キーの配列（宿泊日数分）。例: `["7:30a", "8:00b"]` |
| `open_air_bath_time` | string[] | 露天風呂時刻の配列（宿泊日数分）。例: `["19:00", "8:30"]` |
| `timetable_info` | string[] | 部屋別在泊ステータスの配列（宿泊日数分）。表示文字列をそのまま格納 |
| `late_out` | number | `1` のときレイトチェックアウト |
| `cancel` | number | `1` のとき取得対象外 |

※infraのreservationData取得処理を共通にするかcleaningBoard, Timetable...など機能ごとに分けるべきかは検討すべき。おそらく機能ごとに分けるべき。

### 日数インデックスの計算

連泊ゲストの場合、各配列フィールドは宿泊日数分の要素を持ちます。

```
// idx=0 がチェックイン当日、idx=1 が翌日…
```

`dinner_time[idx]`、`breakfast_time[idx]`、`open_air_bath_time[idx]`、`timetable_info[idx]` がその日の情報です。

---

## 各セクション仕様

### 1. CheckInTime（チェックイン時刻テーブル）

- **表示場所**: 最上部、全幅
- **対象ゲスト**: checkInReservation
- **列**: `VALID_ARRIVAL_TIMES` = 15:00〜22:00（1時間刻み、8列）
- **行**: 最大4行（各時刻に最大4組まで）。8列目右2列は「その他時刻」をまとめて表示
- **ラベル形式**: `{部屋マーク}{特殊時刻表示}{宿泊者名}-{大人数}({子供数})`
  - 例: `㉑鈴木-2(1)` → 21号室、大人2名、子供1名
  - 特殊時刻（VALID_ARRIVAl_TIMESにない文字列）は `"14:00着"` のように `着` を付与して else 列に表示

・現在 cleaningBoard で使用している checkInReservation は、役割が曖昧なためリネームする
・新たに、「targetDate とチェックイン日が一致する予約のみ」を持つ checkInReservation を定義する
・この新しい checkInReservation を Timetable で使用する

### 2. OpenAirBathEvening（夕方露天風呂）

- **表示場所**: CheckInTime直下、全幅
- **対象ゲスト**: stayingReservationで夕方の露天風呂の時間が指定されている
- **列**: `OPEN_AIR_TIMES_EVENING` = 16:00〜22:00（1時間刻み、7列）
- **表示**: 各セルに `{時刻} {部屋マーク} ▢`。部屋マークは予約があれば表示
- **用途**: スタッフが「どの部屋がいつ利用」を確認してチェックボックスに記入

### 3. NumberOfBreakfast（朝食人数）

- **表示場所**: 中段左
- **現状**: 静的な入力欄（動的データなし）

### 4. Dinner（夕食時刻テーブル）

- **表示場所**: 中段中央
- **対象ゲスト**: stayingReservationのdinnerがPENDING or 時間指定されている
- **列**: `["未定", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"]`（7列）
- **dinner_time の値定義**:

  | 値 | 意味 | 表示 |
  |---|---|---|
  | `"NONE"` | 夕食なし | テーブルに表示しない |
  | `"CANCEL"` | キャンセル | テーブルに表示しない |
  | `"PENDING"` | 時間未定 | 「未定」列に表示 |
  | `"17:30"〜"20:00"` | 確定時刻(30min刻み) | 該当時刻列に表示 |

- **ラベル形式**: `{部屋マーク}{宿泊者名}-{大人数}({子供数})`

### 5. GuestInfo（部屋別在泊状況）

- **表示場所**: 右端、全段にまたがる
- **対象ゲスト**: stayingReservation, isTodayVacant
- **表示**: 部屋番号ごとに `timetable_info[idx]` の文字列を表示。予約がない部屋は `"空室"` と表示
- **用途**: メモ欄。内容は予約登録側が `timetable_info` に直接書いた文字列をそのまま表示

### 6. Header + Breakfast（朝食テーブル）

- **表示場所**: 中段左〜中央（GuestInfo 除く）
- **Header**: 翌日の日付ラベルと朝食時刻ヘッダー行（7:30〜9:30）
- **Breakfast データソース**: 両職時間が指定されているstayingReservation
- **breakfast_time キー定義**: 時刻 + `a`/`b` のサフィックス

  | キー | 食場所 |
  |---|---|
  | `"7:30a"`, `"8:00a"`, `"9:00a"` | ラウンジ |
  | `"8:30a"`, `"9:30a"` | 53号室 |
  | `"7:30b"`, `"8:00b"`, `"9:00b"` | ラウンジ |
  | `"8:30b"`, `"9:30b"` | 54号室 |

- **グリッド**: 5列×上段(a)/下段(b)の2段構成
- **ラベル**: 部屋マーク（ROOM_MAP から変換）

※arrivalやbathEveningは夕方で、朝食やbathMorningは翌日の朝の情報だが、targetDateは夕方に合わせて同じstayingReservationを使っていよい。

### 7. CheckoutNotice（本日チェックアウト通知）

- **表示場所**: Breakfast右側
- **対象データ**: isTodayCheckout (rookState.tsに新しく作成, isLateCheckout内でも使用したい)
- **表示**: `㉑▢  ㉛▢` のように2部屋ごとに改行して並べる

### 8. OpenAirBathMorning（朝露天風呂）

- **表示場所**: 朝食テーブル下
- **対象データ**: stayingReservationで朝露天の時間が指定されている
- **列**: `OPEN_AIR_TIMES_MORNING` = 7:30, 8:00, 8:30, 9:00, 9:30（5列）
- **表示**: 時刻と予約部屋マーク

### 9. CheckoutTime（チェックアウト時刻）

- **表示場所**: 最下部
- **列**: 7:30, 8:00, 8:30, 9:00, 9:30, 11:00（6列）
**対象データ**: isLateCheckout
- **表示**: 11:00 列にレイトチェックアウトの部屋マークを表示
---

### 曜日別チェック項目

| 曜日 | 表示内容 |
|---|---|
| 日曜 | `▢資源ごみ　▢ニゴウ情報送信　▢61布団` |
| 月曜 | `▢リネン発注　▢ニゴウ情報送信　▢61布団` |
| その他 | `▢ニゴウ情報送信　▢61布団` |