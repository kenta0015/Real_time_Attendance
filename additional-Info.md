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

1.最小修正（effectiveUserId 統一） Done!

参照・書き込み：effectiveUserId = Session UID || Guest ID

適用範囲：イベント作成 created_by、出席 attendance.user_id、History 集計の参照 ID

2.EAS Update（JS のみ） Done!

eas update --channel internal -m "unify effectiveUserId"

端末側：アプリ再起動 → 更新適用の確認（ログで effectiveUserId 出力が望ましい）

3.  4.2 位置打刻（APK で）Done!

成功/拒否の理由表示（距離/精度/権限）

DoD：押下 → トースト/アラート → 履歴に反映（同一 ID で画面にも反映）

4.  4.3 Enter/Exit（APK で）Done!

半径 100–150m、境界跨ぎで queue 増加・再登録後も安定

前提：ACCESS_BACKGROUND_LOCATION、FOREGROUND_SERVICE_LOCATION、通知許可、電池最適化「制限なし」

5. 最小修正の残り（整合仕上げ） Done!

旧ルートの完全整理、router.push/replace の統一

ゲスト既存データのバックフィル（必要範囲のみ）

6. 英 UI/時差/端末差 最終確認 Done!

Australia/Melbourne（UTC+11）で時刻表示の整合

Pixel/Galaxy 実機で文言/改行/遅延の差異

7. データ・セーフティ整合（AAB/Play Console）Done!

パーミッション申告・バックグラウンド位置の用途説明・ポリシー最終確認

ChatGPT の Google Play Console の各フォームに何を書けばいいかの “回答メモ内にあり！！

8. Event を delite する機能を追加 Done!
   複数のイベントが active の場合、geofence を Arm した場合、すべての active なイベントが有効になってしまう。取り急ぎ Delite で対応。原因はまた後程突き止める

9. Attendee/organizer roll の廃止（本番用としての廃止。Debug 用としては保管）

10. Crashlytics(アプリリリース後、Crashlytics の導入から)

テストクラッシュ送信、Enter/Exit 付近の非致命ログ確認

# 9. Attendee/organizer roll の廃止（本番用としての廃止。Debug 用としては保管）について

## 全体像: 案 1 → 審査出し → 案 2

- フェーズ A: 案 1 の実装完了 ＋ v1 を Google Play に提出
- フェーズ B: 審査待ち期間に案 2 の設計・実装を進める（ローカル or 別ブランチ）
- フェーズ C: v1 公開後に案 2 を載せた v1.1 をリリース

---

## フェーズ A: 案 1（DEV ロールを本番から隠す）＋ v1 審査出し

### A-1. 現状の安定確認とスコープ固定

- [ ] 位置打刻（GPS）と Enter/Exit の挙動を再確認
  - [ ] Organizer 詳細画面から:
    - [ ] GPS Check-in 実行
    - [ ] Geofence ARM / DISARM
  - [ ] History 画面で出席履歴が期待通りに反映されること
- [ ] Event Delete ボタンの挙動を確認
  - [ ] 対象イベントを削除
  - [ ] 一覧から消えていること
  - [ ] Geofence が DISARM されていること（ステータス確認）

ここで「今の v1 の機能セット」を固定した前提で、Step 9（ロール廃止の最小修正）に入る。

---

### A-2. 案 1: DEV ロールを本番から隠す（Debug 用に保管）

#### A-2-1. グローバル設定方針　完了

- [ ] 環境変数で「DEV ロールスイッチ」を制御する方針を明確化

  - 例: `EXPO_PUBLIC_ENABLE_DEV_SWITCH`
  - 本番ビルド:
    - `EXPO_PUBLIC_ENABLE_DEV_SWITCH` を `"0"` または未設定にする
  - 開発ビルド / internal チャンネル:

    - `EXPO_PUBLIC_ENABLE_DEV_SWITCH="1"` を許可

  ※A-2-1. グローバル設定方針（DEV ロールスイッチ）※決定事項

1. 使うフラグを 1 本に統一する

開発用ロール切り替えのオンオフは、これ 1 本だけで管理する方針にします。

環境変数名: EXPO_PUBLIC_ENABLE_DEV_SWITCH

JS 側の定義イメージ（すでに tabs レイアウトで使っている形で OK）

const enableDev =
(typeof **DEV** !== "undefined" && **DEV**) ||
process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1";

このルールの意味:

Expo Go / ローカル開発
**DEV** が true なので、何もしなくても enableDev = true
→ これまで通り DevRoleBadge と DEV 用タブ挙動が使える

EAS Build（internal / production）
**DEV** は false になるので、

EXPO_PUBLIC_ENABLE_DEV_SWITCH="1" → enableDev = true（Debug 用ビルド）

それ以外 → enableDev = false（本番想定）

この「enableDev」を、今後は

app/\_layout.tsx（DevRoleBadge の表示条件）

app/(tabs)/\_layout.tsx（Debug タブ・Organizer ロックの表示条件）

stores/devRole.ts / roleGates.ts（必要なら）

などで共通の「真偽値」として見ていく想定です。

2. EAS 側の設定方針

eas.json の build プロファイルごとに、こういう方針にしておくと整理しやすいです。

internal プロファイル（社内テスト・Debug 用）

env.EXPO_PUBLIC_ENABLE_DEV_SWITCH = "1"

→ DevRoleBadge や Debug タブを使ってテストできる

production プロファイル（ストア提出用）

env.EXPO_PUBLIC_ENABLE_DEV_SWITCH は 設定しない か "0"

→ すべての DEV ロール UI・挙動が封印される

この設定さえしておけば、

「どのビルドでロール切り替えを出すか」は eas.json 側だけで制御できる

コード内では常に enableDev を見るだけで済む

という状態になります。

#### A-2-2. DevRoleBadge（画面右上のロール切替バッジ）の制御　完了

対象ファイルの想定:

- app/\_layout.tsx
- components/DevRoleBadge.tsx（存在する場合）

やること:

- [ ] DevRoleBadge を描画する条件に `enableDev` を追加
  - [ ] `EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1"` のときだけ表示
  - [ ] 本番ビルドではバッジが一切出ない状態にする

#### A-2-3. Tabs 周りのロール依存の整理(ロール切り替えの中身は完了（ログで確認済み　ラベルだけが Organize (locked) に変わらないが、機能的には OK なので放置)

対象ファイル:

- app/(tabs)/\_layout.tsx

やること:

- [ ] Organizer タブの `href` 制御を見直す
  - [ ] 本番ビルドでは:
    - Organizer タブは常に有効（ロック表示は不要）
  - [ ] Debug 時のみ:
    - Attendee ロール選択時に `href: null` などでロック表示してもよい
- [ ] Debug 用の Hidden ルート（admin など）はそのまま維持
  - [ ] `options={{ href: null }}` でタブには出さず、直接リンクでのみアクセスできる状態を保つ

#### A-2-4. devRole ストアと role Gate の扱い

対象ファイル例:

- stores/devRole.ts
- components/roleGates.ts
- app/(tabs)/organize/admin/\_layout.tsx など

やること:

- [ ] `useIsOrganizer` / `useIsAttendee` 内で `enableDev` をチェック
  - [ ] `enableDev` が false の場合:
    - 本番では「Organizer アプリ」として扱う（実質 `isOrganizer = true` としてよい）
  - [ ] `enableDev` が true の場合:
    - 今まで通り DEV ロールスイッチの状態を反映（Debug 用）
- [ ] Admin 系ルートは引き続き `useIsOrganizer` でガード
  - 本番ユーザーは通常触れない想定で問題ない

---

### A-3. 案 1 実装後のテスト観点

- [ ] Debug ビルド（Expo Go / internal 環境）
  - [ ] DevRoleBadge が表示され、Organizer/Attendee 切替ができる
  - [ ] Tabs 表示:
    - [ ] History / Organize / Profile / Debug の 4 つが期待通り
  - [ ] Organizer / Attendee モード切替で:
    - [ ] Organizer: Organize タブからイベント作成〜QR 表示ができる
    - [ ] Attendee: Organizer 機能側がロック（または使わない想定）でも、最低限 History や Scan が検証できる
- [ ] 本番設定と同等のビルド（ローカルで env を本番設定にする）
  - [ ] DevRoleBadge が表示されないこと
  - [ ] Tabs に余計なタブが出ていないこと
  - [ ] Organizer フロー（イベント作成〜QR〜Check-in〜History）が一通り問題なく動く

---

### A-4. v1 の Google Play 提出フロー

#### A-4-1. ビルドとバージョン管理

- [ ] app.json / app.config の version / versionCode を更新
- [ ] EAS Build:
  - [ ] Android AAB を production 用プロファイルでビルド
  - [ ] 実機で最終確認（APK か internal track 経由）

#### A-4-2. Play Console 側の設定

- [ ] アプリの説明文・スクリーンショットの更新
- [ ] Data Safety フォーム:
  - [ ] 位置情報（foreground / background）利用の目的を整理
  - [ ] ジオフェンス・出席管理の用途として記載
- [ ] パーミッション説明:
  - [ ] ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION
  - [ ] ACCESS_BACKGROUND_LOCATION
  - [ ] FOREGROUND_SERVICE_LOCATION 等がある場合の説明

#### A-4-3. 審査提出

- [ ] テストトラック（internal または closed）で AAB をアップロード
- [ ] リリースノートに v1 の範囲を簡潔に記載
- [ ] 審査へ送信

ここまでで「案 1 ベースの v1 をストアへ提出」までを完了とする。

---

## フェーズ B: 審査待ち期間中に案 2（Register ＋ロール設計）の準備

審査中は Play Console に新ビルドを出さず、ローカル or 別ブランチで作業する想定。

### B-1. 案 2 の仕様固め（ドキュメント化）

- [ ] Register 画面の UX をテキストで整理
  - [ ] 入力項目:
    - [ ] 名前（表示名）
    - [ ] 役割（Organizer / Attendee）
  - [ ] 初回起動時のフロー:
    - [ ] 未登録ユーザーは必ず Register 画面へ
    - [ ] 登録済みユーザーは role に応じたホームへ遷移
- [ ] Organizer / Attendee 用の「ホーム画面イメージ」を言語化
  - Organizer:
    - 現状の Organize タブ＋ History をベース
  - Attendee:
    - 参加イベント一覧（History ベース）
    - QR スキャン入口（attend/scan）
- [ ] 既存の招待トークン（join フロー）とどう組み合わせるかの案をまとめる

### B-2. データモデル案

- [ ] Supabase 側に `user_profile.role` などのカラム追加案を整理
  - [ ] 値の候補: `"organizer"`, `"attendee"`
  - [ ] 既存ユーザーのデフォルトは `"organizer"` とするか要検討
- [ ] ローカル保存との役割分担を決める
  - [ ] 本当のソースオブトゥルースは Supabase か
  - [ ] 端末ごとの一時フラグとして AsyncStorage を使うか

### B-3. ルーティング方針

- [ ] 起動時のエントリーポイント
  - [ ] `app/index.tsx` または `app/_layout.tsx` で
    - [ ] 「role が未登録なら /register」へ
    - [ ] role があれば:
      - Organizer → `/organize` または `/events`
      - Attendee → `/events` または専用タブ
- [ ] タブ構成の草案
  - Organizer:
    - History / Organize / Profile / Debug
  - Attendee:
    - My Events / Scan / Profile 等、シンプルな構成

---

## フェーズ C: v1 公開後に案 2 を実装して v1.1 としてリリース

ここから先は、v1 公開後の段階で実際に手を動かすフェーズ。

### C-1. 実装ステップ（案）

- [ ] ブランチ作成
  - 例: `feature/register-role-v2`
- [ ] Register 画面の UI 骨組み
  - [ ] 名前入力
  - [ ] ロール選択（Organizer / Attendee）
  - [ ] 決定ボタン
- [ ] Supabase との連携
  - [ ] プロファイルテーブルに role を保存
  - [ ] ログイン済みユーザーの role を取得するフック作成
- [ ] 起動フローの組み込み
  - [ ] `app/index.tsx` で:
    - [ ] role 未設定 → `/register`
    - [ ] role 設定済み → role に応じてホームへ
- [ ] タブ構成の出し分け
  - [ ] Organizer 用タブ
  - [ ] Attendee 用タブ（最低限: 履歴＋スキャン入口）

### C-2. テストとリリース準備

- [ ] 新旧ユーザーのテストケース洗い出し
  - [ ] v1 から v1.1 にアップデートした場合
  - [ ] 新規インストールの場合
- [ ] EAS Build で v1.1 用 AAB を作成
- [ ] Play Console でアップデートとして提出

---

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

# 「Swipe で落とすと EXIT が来ない」の有力原因（優先順）：

1. タスク定義が“画面内”にある

TaskManager.defineTask('RTA_GEOFENCE', …) が画面（例 /organize/events/[id].tsx）に置かれていると、プロセスが落ちた後は定義自体が読み込まれないため、ENTER/EXIT ブロードキャストが届いてもヘッドレス実行できない。

対策：トップレベルのモジュール（例 src/tasks/geofence.ts）に定義し、アプリのエントリ（app/index.tsx など）からインポートして常時登録しておく。

2. Swipe Kill 後に“プロセス復帰の足掛かり”が無い

Android はユーザー操作でタスクを掃くと、常駐していない限りプロセスを即終了。純ジオフェンスは OS 側で保持されるが、Expo のヘッドレス JS を起こせない端末状態だと処理が走らないことがある。

対策：Arm 時に 軽量の startLocationUpdatesAsync（foregroundService 付き）を並走させ、数分〜継続的にプロセス生存/再起動のフックを作る（バッテリー最適化は Unrestricted で回避済み）。

3. Expo Task Manager の制約（Killed 状態）

Expo のタスクはユーザーが明示終了した状態では走らない場合がある（端末/OS バージョン差あり）。Pixel でも再現例あり。

対策：① のトップレベル定義＋ ② の前景サービス併用で実務上は安定。

4. 再アームの永続化不足

プロセス終了で登録が落ちているのに UI は「Armed」のまま…という齟齬。

対策：AsyncStorage に armed:true, eventId, regions を保存し、アプリ起動時に自動で再登録。必要なら**通知で“Re-armed”**を出す。

5. 端末/OS の省電力・メーカー挙動

Doze やデバイスごとの最適化がヘッドレス起動を抑制。

対策：既に設定済みの Allow all the time + Battery Unrestricted は正解。SIM の有無やオフラインはジオフェンス自体には無関係。

## 結論

いまは Home ケースで OK → リリースで良い。
後で Swipe Kill も安定させるなら、① タスクのトップレベル化＋ ②Arm 時に前景サービスで keep-alive ＋ ④ 自動再アーム、この 3 点が最も効果的。

# Show Event QR から戻ると History に行く

対象画面：/app/(tabs)/organize/events/[id]/qr.tsx（Show Event QR）

遷移元：/app/(tabs)/organize/events/[id].tsx（Organizer のイベント詳細）

現象：Show Event QR を開いた後、Android の戻るボタンを 1 回押すと History タブ に戻る。イベント詳細には戻らない。

他画面の戻り挙動：

Live（/app/(tabs)/organize/events/[id]/live.tsx）：戻る 1 回でイベント詳細に戻る

Scan（Organizer）（/app/(tabs)/organize/events/[id]/scan.tsx）：戻る 1 回でイベント詳細に戻る

実施済み作業：live.tsx/scan.tsx を (tabs) 配下へ移動済み。

追加メモ：ADB 直 URL テストは Live で実施し、現在は「通常フロー（イベント詳細 → 各画面）」での挙動を確認済み。QR のみ上記の戻り挙動。

※Check in/invite/Setting も戻るを押すと History に行ってしまう

### EventDetail 単体共通化：今回は手を付けない（後続タスク候補として据え置き）

# 本番では enableDev = false」のルールを決める

EXPO_PUBLIC_ENABLE_DEV_SWITCH をどこで管理しているかによりますが、基本はこんな方針にします：

開発（ローカル / Dev Client / internal APK）

EXPO_PUBLIC_ENABLE_DEV_SWITCH=1

Play Console に出す「本番用 AAB」

EXPO_PUBLIC_ENABLE_DEV_SWITCH=0

# Dev ロール切り替えを出したい時／隠したい時」の切り替えメモ

1. どこをいじればいいか

enableDev を使っているファイルは少なくともこの 4 つ：

1.app/\_layout.tsx

DevRoleBadge を出すかどうかを決めている。

2.(tabs)/\_layout.txs

3.app/(tabs)/screens/EventsList.tsx（History タブ）

4.app/(tabs)/organize/index.tsx（Organize タブ）

ルール：この 4 つの enableDev の値を必ず同じにする。
これがずれると、「バッジは出ないけど中身は Attendee ロール」みたいなズレがまた起きます。

2. Dev ロール切り替えを 復活させる（開発モード）
   やること

3 ファイルとも、enableDev を 環境依存の式に戻す：

const enableDev =
(typeof **DEV** !== "undefined" && **DEV**) ||
process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1";

**DEV** === true の Expo Go では、自動的に Dev モード ON

本番ビルドでも EXPO_PUBLIC_ENABLE_DEV_SWITCH=1 を入れれば Dev モードを強制 ON にできる

挙動

DevRoleBadge が表示される

Badge から Organizer / Attendee を切り替えると：

AsyncStorage("rta_dev_role") が更新される

DeviceEventEmitter("rta_role_changed") → History / Organize がそれを拾ってロールを更新

History / Organize は Attendee / Organizer 両方の UI を切り替えて確認できる

3. Dev ロール切り替えを 一時的に隠す（本番想定モード）
   やること

3 ファイルとも、enableDev を 固定で false にする：

const enableDev = false;

（\_layout.tsx, EventsList.tsx, organize/index.tsx の 3 か所）

挙動

DevRoleBadge が表示されない

EventsList / Organize では：

enableDev === false の分岐で ロールを強制的に "organizer" にする

rta_role_changed のリスナーもスキップする
→ 画面の「視点」は常に Organizer 固定

つまり、

History …「Organizer 視点の履歴」UI

Organize …「イベント作成＋ Organizer 用 Recent events」UI
のまま変わらない

4. 切り替えるときのワークフロー

変更したいモードに合わせて、上の通り 3 ファイルの enableDev を揃える

expo start -c で一度キャッシュをクリアして再起動すると確実

Dev モード ON にした直後で挙動がおかしければ、DevRoleBadge から一度 Organizer / Attendee をタップして rta_dev_role をリセットする

これで、

開発中に切り替えて挙動確認したいとき → Dev モード（enableDev=式）

審査・本番想定の挙動を見たいとき → Organizer 固定モード（enableDev=false）
