# 1.EXPO_PUBLIC_ENABLE_DEV_SWITCH は true で内部テスト中は OK。本番リリース前に false に戻すのを忘れないで。

# 2.インストール後のアプリの起動には monkey は使わない。起動は**am start -W**に統一　　ぐるぐるが発生する

### ADB launch & log (no monkey)

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial = "192.168.1.208:34111"
$pkg = "com.kenta0015.geoattendance.internal"
$act = "$pkg/$pkg.MainActivity"
$out = ".\rta_after_launch.txt"

& "$adb" connect $serial | Out-Null
& "$adb" -s $serial shell am force-stop $pkg
& "$adb" -s $serial shell am start -W -n $act -a android.intent.action.MAIN -c android.intent.category.LAUNCHER
Start-Sleep -Seconds 45
& "$adb" -s $serial logcat -d -v time ReactNative:V ReactNativeJS:V Expo:V OkHttp:V AndroidRuntime:E ActivityManager:I WindowManager:W \*:S > $out
Get-Content $out -Tail 120

補足（運用ルール・超短）

pm clear は必要時のみ（初回 OTA 取得で待つ →“ぐるぐる”に見えるため）。

負荷試験やランダム操作以外で**monkey は使わない**。

再現テストは「手タップ」と同等の上記コマンドに固定。

# 3.WEB でアプリの開き方

### 1) Web 用に書き出し

npx expo export --platform web
cd C:\Users\User\Downloads\RTA
npx serve -s dist -l 5173

### 2) ローカルで配信（どれか入ってる方）

npx http-server dist -p 5173

### もしくは

npx serve dist -l 5173

# 4.USB の接続

端末で USB 接続後（USB debbugging ）

$pt = "C:\Users\User\AppData\Local\Android\Sdk\platform-tools"
$env:Path = "$pt;$env:Path"
adb version
adb devices

### そこから dec client で接続する場合

adb -d reverse --remove-all
adb -d reverse tcp:8081 tcp:8081

adb -d shell am force-stop com.kenta0015.geoattendance.internal
adb -d shell am start -W -n com.kenta0015.geoattendance.internal/.MainActivity
adb -d shell am start -W -a android.intent.action.VIEW -d "rta://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"

その後別ターミナルで下記を行い、アプリ起動させる（これをやらないと黒い画面になるだけ）
npx expo start --dev-client --clear

それでもアプリが起動しなさそうなら端末でスワイプして終了し、アプリをもう一度開きなおす

※アンドロイドの画面がスリープモードになると接続が切れる。その場合はアプリをスワイプで閉じて、また開きなおす。もしくは adb reverse tcp:8081 tcp:8081 を打ってアプリをスワイプで閉じて、また開きなおすもしくはリロード

# 5.Logcat

強化版 logcatA（最小セット：あなたの既定）
& "$adb" -s $serial logcat -c

# ← ここで 5 分ほど普通に操作（起動 → タブ遷移 →QR 画面 → 戻る 等）

& "$adb" -s $serial logcat -d -v time AndroidRuntime:E ReactNative:V ReactNativeJS:V \*:S `
| Tee-Object .\rta_crash_scan.txt

Select-String -Path .\rta_crash_scan.txt -Pattern 'FATAL EXCEPTION|AndroidRuntime|SoLoader|SIGSEGV|ANR' `
| Select-Object -First 50

強化版 logcatB（チェックイン周りを濃く）
& "$adb" -s $serial logcat -c

# ← 端末で「Check In」を 1 回タップ（10 秒以内）

Start-Sleep -Seconds 10
& "$adb" -s $serial logcat -d -v time ReactNativeJS:V ReactNative:V AndroidRuntime:E "\*:S" `
| Tee-Object .\rta_checkin_full.txt | Out-Null

Select-String -Path .\rta_checkin_full.txt -Pattern `  'qr_checkin_with_pin|Checked in|ARRIVED|TOKEN_INVALID|signature|expired|RAW_SCAN|token='`
| Select-Object -First 120

強化版 logcatC（events バッファも保存）
& "$adb" -s $serial logcat -c

# ← 端末で再現操作（〜10 秒）

Start-Sleep -Seconds 10
& "$adb" -s $serial logcat -d -v time AndroidRuntime:E ReactNative:V ReactNativeJS:V "\*:S" `
| Tee-Object .\rta_full.txt | Out-Null

& "$adb" -s $serial logcat -b events -d -v time "\*:S" `  | Select-String 'am_anr|am_crash|am_fully_drawn'`
| Tee-Object .\rta_events.txt | Out-Null

Select-String -Path .\rta_full.txt -Pattern 'FATAL EXCEPTION|AndroidRuntime|SoLoader|SIGSEGV|ANR|qr_checkin_with_pin|token=' `
| Select-Object -First 120

# 6.サインインの Deep Link

# adb のフルパス（Android Studio 標準）

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

# 端末確認（出てくるはず: "device"）

& $adb devices

# 物理端末なら -d、エミュなら -e

& $adb -d shell am start -a android.intent.action.VIEW -d "rta://join"

# devclient にアクセスできなかった件

何が原因だった？

ほぼ確実に（確信度 95%）

Metro に到達できていなかったのが本質。
具体的には

adb reverse が未設定／別端末に刺さっていた、

PowerShell で $adb が未定義のまま & $adb ... を打って失敗、

そのまま rta://... を開いても 端末 →PC の 8081 に橋が無くて JS バンドルが取れず、Unable to load script → 数秒後に黒画面、という流れ。
（途中で monkey を使うと別 Activity 経由になって状態がややこしくなるのも悪化要因。）

# 次回“確実に”つながる 2 ステップ

（PowerShell・USB 接続前提。コマンドはそのまま貼って OK）

## 1. Metro を起動して ADB 逆ポートを張る

# Metro（必要なら --port 変更可）

npx expo start --dev-client --clear

# ADB 実体と端末シリアルを確定

$adb = Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk\platform-tools\adb.exe'
if (!(Test-Path $adb)) { $adb = (& where.exe adb 2>$null | Select-Object -First 1) }
$serial = (& "$adb" devices | Select-String 'device$' | Select-Object -First 1).ToString().Split("`t")[0]

# 逆ポートをクリーン＆張り直し（Metro が 8081 ならそのまま）

& "$adb" -s $serial reverse --remove-all
& "$adb" -s $serial reverse tcp:8081 tcp:8081

# Metro 稼働確認（PC 側で OK が出れば良い）

Start-Process "http://localhost:8081/status"

## 2. Dev クライアントを前面 → ディープリンクで接続

# アプリ（Dev Client）を前面起動

& "$adb" -s $serial shell am start -W -n com.kenta0015.geoattendance.internal/.MainActivity

# 127.0.0.1 を使って Metro へ（※reverse 前提）

& "$adb" -s $serial shell am start -W -a android.intent.action.VIEW `
-d "rta://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"

# ロードマップ v2

## B. APK / ネイティブ検証フェーズ（今回ここで 4.2 / 4.3 を実装・確認）

1.最小修正（effectiveUserId 統一） Done

参照・書き込み：effectiveUserId = Session UID || Guest ID

適用範囲：イベント作成 created_by、出席 attendance.user_id、History 集計の参照 ID

2.EAS Update（JS のみ） Done

eas update --channel internal -m "unify effectiveUserId"

端末側：アプリ再起動 → 更新適用の確認（ログで effectiveUserId 出力が望ましい）

3.  4.2 位置打刻（APK で）

成功/拒否の理由表示（距離/精度/権限）

DoD：押下 → トースト/アラート → 履歴に反映（同一 ID で画面にも反映）

4.  4.3 Enter/Exit（APK で）

半径 100–150m、境界跨ぎで queue 増加・再登録後も安定

前提：ACCESS_BACKGROUND_LOCATION、FOREGROUND_SERVICE_LOCATION、通知許可、電池最適化「制限なし」

5. 最小修正の残り（整合仕上げ）

旧ルートの完全整理、router.push/replace の統一

ゲスト既存データのバックフィル（必要範囲のみ）

6. Crashlytics

テストクラッシュ送信、Enter/Exit 付近の非致命ログ確認

7. 英 UI/時差/端末差 最終確認

Australia/Melbourne（UTC+11）で時刻表示の整合

Pixel/Galaxy 実機で文言/改行/遅延の差異

8. データ・セーフティ整合（AAB/Play Console）

パーミッション申告・バックグラウンド位置の用途説明・ポリシー最終確認

9. Attendee/organizer roll の廃止（本番用としての廃止。Debug 用としては保管）

# ① どの画面が Session / Guest を参照しているか

| 画面 / ルート                             | 役割                                       | 参照 ID                                                             | 根拠（主なファイル）                                                                                                |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **/join**                                 | サインイン／トークン Join                  | **Session**（`supabase.auth.user.id`）※DEV トークン書き換え時に使用 | `app/join.tsx`（`supabase.auth.signIn…`, `waitForSessionUserId`）                                                   |
| **/(tabs)/events**（タブ「History」）     | 履歴一覧（作成/参加の集約）                | **Guest**（端末ローカルの擬似 UID）                                 | `app/(tabs)/events.tsx` → `screens/EventsList.tsx`（`getGuestId()`, `getGuestIdShort()`）                           |
| **/(tabs)/organize**（タブ「Organize」）  | イベント作成＆最近のイベント表示           | **Guest**（作成者 `created_by` に使用）                             | `app/(tabs)/organize/index.tsx`（`createdBy = await getGuestId()` → `createEvent({ p_created_by: createdBy, … })`） |
| **/(tabs)/organize/events/[id]**          | イベント詳細（参加者側のチェックイン含む） | **Guest**（出席 `attendance` 挿入時の `user_id`）                   | `app/(tabs)/organize/events/[id].tsx`（`user_id: await getGuestId()`）                                              |
| **/(tabs)/organize/events/[id]/checkin**  | 主催者のチェックインリスト                 | **ID 不要**（ユーザー ID は使わず、eventId で集計）                 | `app/(tabs)/organize/events/[id]/checkin.tsx`（eventId ベースの一覧・集計）                                         |
| **/(tabs)/organize/events/[id]/invite**   | 招待用情報                                 | **ID 不要**（eventId のみ）                                         | `app/(tabs)/organize/events/[id]/invite.tsx`                                                                        |
| **/(tabs)/organize/events/[id]/settings** | イベント設定                               | **ID 不要**（eventId のみ）                                         | `app/(tabs)/organize/events/[id]/settings.tsx`                                                                      |
| **/(tabs)/organize/admin/[eventId]/live** | Live 管理（リダイレクト）                  | **ID 不要**（eventId のみ）                                         | `app/(tabs)/organize/admin/[eventId]/live.tsx`（`/organize/events/${eventId}/live` へリダイレクト）                 |
| **/(tabs)/profile**                       | 現在ロール／Guest ID 表示                  | **Guest**（表示＆トグル）                                           | `app/(tabs)/profile/index.tsx`（`useRoleStore`, `getGuestId` の表示）                                               |
| **/(tabs)/debug**                         | セッション/環境の可視化                    | **Session**（表示）※動作は ID 非依存                                | `app/(tabs)/debug.tsx`（`supabase.auth.getSession()` 表示）                                                         |

参考：Guest ID の実体は stores/session.ts のローカル永続（AsyncStorage）で、Supabase の Session UID とは独立です。

併存ルート：/app/organize/... や /app/events/[id].tsx などタブ外の旧ルートも残っています（例：app/organize/events/[id]/scan.tsx は Guest で出席登録）。通常運用は (tabs) 配下に統一されているため、ディープリンクは (tabs) 側へ合わせるのが安全です。以前の警告「No route named …/qr」はこの二系統併存が原因です。

# eventId が必須の画面

必須（eventId に完全依存）

/(tabs)/organize/events/[id]

/(tabs)/organize/events/[id]/checkin

/(tabs)/organize/events/[id]/invite

/(tabs)/organize/events/[id]/settings

/(tabs)/organize/admin/[eventId]/live（= [id]/live へ転送）

旧ルート群：/organize/events/[id]/scan など

不要（eventId なしで成立）

/join（サインイン／DEV トークン再署名時のみ Session を使用）

/(tabs)/events（History：Guest で自分の「作成/参加」から集計）

/(tabs)/organize（作成時に Guest を created_by へ）

/(tabs)/profile（表示のみ）

/(tabs)/debug（表示のみ）

#　違うイベントの QR でもログインできてしまう問題

事実確定済み：Organizer 経路で **p_event_id がトークン側の event（B）**としてサーバに届いている（checkin_audit.note で確認済み）。

サーバは「token の event と p_event_id が一致なら受理」なので、A 画面でも B に記録されます。

したがって、残っている原因は **クライアントのどこか別経路が token の event を p_event_id に入れている（またはディープリンクで attend/checkin が動いている）**こと。

再開時の最短 3 タスク（どれか 1 つで OK）：

Organizer スキャナの RPC 直前ログで p_event_id を一度だけ出力（ルート id と一致するか）。

Supabase の API ログで実機スキャン直後のリクエストの body を確認（p_event_id が何で送られているか）。

ディープリンクが走っていないか、Organizer 画面だけ リンク自動遷移を無効化して再テスト。

# expo で test するとき

$pt = "$env:LOCALAPPDATA\Android\Sdk\platform-tools"
$adb = Join-Path $pt "adb.exe"
$env:Path = "$pt;$env:Path"
& $adb start-server
& $adb devices

$exp = "exp://192.168.1.203:8081"   # ←あなたの LAN URL に置換
$id = "6252e880-30c7-41e5-95c2-b1cad25de83f" # 対象イベント ID
& $adb shell am start -W -a android.intent.action.VIEW `
  -d "$exp/--/organize/events/$id/checkin"

<event id>
6252e880-30c7-41e5-95c2-b1cad25de83f

## サインイン画面を出現させる方法

方式 A：アプリのデータを消去して起動（推奨）

Expo Go で確認する場合

Android 設定 → アプリ → Expo Go → 「ストレージとキャッシュ」

ストレージを消去（= AsyncStorage が空になる → セッション消滅）

PC で npx expo start -c（キャッシュもクリア）→ 端末で新 QR を読み込む

/join が出続けるので、画面の Session 行が “Not signed in” であることを確認

インストール済み APK で確認する場合

Android 設定 → アプリ → GeoAttendance（あなたの APK 名） → 「ストレージとキャッシュ」

ストレージを消去

アプリを起動 → /join が出続ける → Session 行を確認

# /organize と /events を単一 EventDetail へ共通化

目的
重複した実装を排除し、修正を一箇所で完結。URL は現状維持（参加者 /events/[id]、主催者 /organize/events/[id]）。

構成

components/event/EventDetail.tsx：単一の本体（取得・RSVP・GPS/QR・ロール別ボタン・開発メトリクス）。

ラッパ：

app/(tabs)/events/[id].tsx → role="attendee" で EventDetail を描画

app/(tabs)/organize/events/[id].tsx → role を渡して EventDetail を描画

EventDetail の責務

イベント取得（alias 統一：venue_lat:lat, venue_lng:lng, venue_radius_m:radius_m 等）

RSVP 読み/保存（event_members.upsert）

出席登録（attendance へ GPS/QR 挿入）

ロール別 UI：

参加者：RSVP / GPS チェックイン / スキャナ / Google Maps

主催者：スキャナ / Check-in List / Invite / Settings / Google Maps

getEffectiveUserId() でユーザー ID 統一

可視性ルール（ボタン欠落の再発防止）

role 明示チェックで条件出し分け。

必須ボタンはマウント固定（レイアウトずれで消えない）。

移行ステップ（小さく安全に）

既存本体を EventDetail.tsx に抽出（見た目不変）。

/organize/.../[id].tsx を EventDetail 利用に置き換え検証。

/events/[id].tsx を薄いラッパ化（role="attendee"）。

共有フックやヘルパは後追いで分離（任意）。

受け入れチェック（最小）

参加者 URL：RSVP/GPS/Scanner/Maps が表示・動作。

主催者 URL：Scanner/Check-in List/Invite/Settings/Maps が表示・動作。

GPS/QR 後に「Checked-in」ピルが即反映。

エイリアス不整合なし・未定義なし。

OTA（EAS Update）で両 URL 同時に反映。

既知の落とし穴（再発防止メモ）

checked_in_at_utc は DEFAULT now()（既存は埋めてから NOT NULL 化）。

Dev 端末は必ず getEffectiveUserId() を使う（auth→guest フォールバック）。

QR は EXPO_PUBLIC_QR_SECRET と currentSlot を共通で。

ロールバック
緊急時は /events/[id].tsx を一時的に /organize/events/[id] へ router.replace()。
