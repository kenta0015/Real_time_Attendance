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

## A. Dev / JS フェーズ（EAS Update 配信可）

1.初回起動 … done

2.位置/カメラ許可（UI/プロンプト確認まで）… done

3.rta://join 導線 … done

4.1 QR 打刻（JS） … done

5.UI パリティ（History の Active/Upcoming/Past、Live の Total/On-time/Late 等）

手段: Dev で実装 → internal チャンネルに EAS Update

DoD: Android でも数値が描画される／ゼロ件時の表示が定義どおり

6.Organizer 導線（Show Event QR / Live / Rank）

手段: Dev 実装 → EAS Update

DoD: 全ボタンが到達・戻り導線含め正常（Rank の所在も明確化）

備考: 下部タブの“所属/organize グループ”は優先度低（必要なら 5 に含める）

✅ この段階は Manifest を触らない想定。修正は EAS Update で回せます。

## B. APK / ネイティブ検証フェーズ（今回ここで 4.2 / 4.3 を実装・確認）

4.2 位置打刻（ボタンで GPS 判定） … Dev スキップ → APK で実機検証

目的: 現在地の取得 → 判定 → 成功/拒否メッセージ（理由付き）

DoD:

位置取得エラーのリトライ/メッセージ

成功時：履歴反映・UI 更新

拒否時：理由コード（距離超過 / 精度不足 / 権限 NG 等）表示

4.3 Enter/Exit（ジオフェンス） … Dev は煙テストのみ。実動は APK 必須

目的: BG で Enter/Exit を安定検出（“開始時に既に内側”は enter が来ない仕様を前提）

DoD:

半径 100–150m で 境界を跨ぐと queue が増加

停止/再開・再登録でも安定

Mock Location でも再現可（動けないときの代替）

7.Crashlytics 動作（BG Enter/Exit 含むスタック・非致命ログ確認）

目的: クラッシュ収集とキーログ（イベント到達／失敗理由）

DoD: テストクラッシュ送信確認・Enter/Exit 付近のログがダッシュボードに載る

8.英 UI/時差/端末差 最終確認（Pixel/Galaxy 実機で APK）

9.データ・セーフティ整合（AAB/Play Console で最終確認）

### 🔧 APK 事前チェック（4.2/4.3/7 の前提）

ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION / ACCESS_BACKGROUND_LOCATION

FOREGROUND_SERVICE_LOCATION（Android 14+ で必須。FOREGROUND_SERVICE だけでは不足）

通知許可（必要に応じて）

バッテリー最適化：端末側で Unrestricted（制限なし）

位置：常に許可 + Precise ON、位置精度 ON（Wi-Fi/Bluetooth スキャン）

## 実務運用の順番（更新版）

1.A フェーズ完了：5/6 を Dev→EAS Update で“緑”にする

2.APK 作成：Manifest 系そろえてビルド（versionCode++ は AAB 向け時）

3.B フェーズ実機検証：

     4.2（GPS ボタン） → 4.3（Enter/Exit） → 7（Crashlytics） → 8 → 9

     JS 微修正は都度 EAS Update で反映、Manifest 変更は再ビルド

# Enter/Exit テストと APK の必要性

結論：バックグラウンドの Enter/Exit 信頼性は APK（または AAB）で検証すべき。

Dev Client/デバッグは OS の省電力・プロセス回収でタスク登録が不安定になりがち。

Expo Location の Geofencing（TaskManager）は終了中も動作しますが、Android では下記が前提：

ACCESS_FINE_LOCATION と ACCESS_BACKGROUND_LOCATION が許可済み

端末側でアプリを「電池の最適化から除外」

位置精度は「正確な位置」を ON

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
