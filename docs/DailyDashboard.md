# Daily Dashboard作成法人

現在：/timetable, /cleaningboard でUIを表示して印刷ボタンを押して印刷する。

問題1：これらの２つには印刷以外に機能がないのにわざわざpathを作って表示している。
問題2：UI上で/timetable へユーザが遷移することができない
解決策："/dailydashboard"(Daily Dashboard画面)をdefaultで表示してそこで「当日のタイムテーブルの印刷ボタン」と「翌日のタイムテーブルの印刷ボタン」を表示して印刷できるようにする。/timetable, /cleaningboard の画面は必要ない(現在は/timetable, /cleaningBoard に表示されているUI画面をほぼまるごといんさつしている感じなので、変更時に工夫が必要かもしれない, UI自体はとりあえずはシンプルで良い)

問題：今日の日付のタイムテーブル、明日の日付のcleaningboardしか表示してない
解決策：MUIで日付選択できるようにする。TodayボタンのUIはreference/TodayButton.pngを参考にせよ。>と<は前日/翌日に切り替えられる
UI参考：
< [calendar icon ] mm/dd (x日後/前) > [Todayボタン]
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

問題1：/time-restricted にあくせすすると 「利用可能時間: 6:00 〜 23:00（JST）」以外の時間でも表示されてしまう。
問題２：設定されていないパスにアクセスすると「404 This page could not be found.」と表示される
解決策: 設定されてないパス+利用時間内に/time-restricted にあくせすすると"/"にリダイレクトされるようにしたい

-----------

変更に伴い...
問題：timetableとcleaningBoardのE2Eテストを変更する必要がある
解決："/Dailydashboard" のE2Eテストだけという形にするが、現在のtimetableのE2Eテストを再利用(もちろん必要に応じて中身やファイル名を変更する)する方針にしたい。
※2つのapiは変更する必要なし
