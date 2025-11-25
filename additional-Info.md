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

A-4 進捗まとめ

A-4-1. ビルドまわりの最終チェック（ローカル）

実質 OK 扱いで問題ない状態です。

ローカル環境は今回の署名問題の影響を受けておらず、EAS でのビルドも通っているので、「リリースを止めるレベルのビルド問題」は残っていません。

A-4-2. EAS で本番 AAB をビルド ✅ 完了

eas build --platform android --profile production で、本番用パッケージ
com.kenta0015.geoattendance の AAB を作成済み。

Keystore も Play Console 側と整合するように設定済み。

A-4-3. 内部テストトラックでの最終確認 ✅ 完了

内部テストトラック v1-internal に versionCode 2 の .aab をアップロード済み。

端末のアプリ情報で
App installed from Google Play Store
com.kenta0015.geoattendance.internal / version 1.0.0
を確認済み。

そのビルドを実際に端末にインストールして、ざっと機能チェック → 「全体的に OK」とのこと。

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

### B-1 で決めたこと（案）

Register 画面

必須項目：Display name + Role

Skip はナシ

「登録済み」の定義

user_profiles に存在し、display_name と role が埋まっている。

起動フロー

user_profiles.role が無ければ必ず /register

あれば Organizer / Attendee のホームへ直行

ホーム画面のイメージ

Organizer：自分が主催するイベントの Today/Upcoming 一覧を起点に、Live/QR/Invite へ飛べる

Attendee：自分の My Events を起点に、Scan への導線を常に見せる

招待トークンとの組み合わせ

Register 前に招待から来た場合は、招待内容に応じて role 初期値を決める

Register 後は role は変えず、イベントとの関係だけを追加する

### B-2. データモデル案

- [ ] Supabase 側に `user_profile.role` などのカラム追加案を整理
  - [ ] 値の候補: `"organizer"`, `"attendee"`
  - [ ] 既存ユーザーのデフォルトは `"organizer"` とするか要検討
- [ ] ローカル保存との役割分担を決める
  - [ ] 本当のソースオブトゥルースは Supabase か
  - [ ] 端末ごとの一時フラグとして AsyncStorage を使うか

###B-2 で「決まったこと」要約

user_profiles.role（text）を追加し、値は "organizer" / "attendee" の 2 種類。

既存ユーザーはすべて "organizer" で埋める（初期マイグレーション）。既存ユーザーは一旦すべて "organizer" として扱う。新規ユーザー：Register 経由で role を必ず埋める（将来の B/C フェーズで実装）

グローバルロールのソース・オブ・トゥルースは Supabase 側。
AsyncStorage はあくまでキャッシュ／DEV override 用。

有効ロールの解決は：

本番：effectiveRole = user_profiles.role

DEV：effectiveRole = devRoleOverride ?? user_profiles.role

public.user_profile に以下を追加：

display_name text

role text（'organizer' / 'attendee'）

既存ユーザーは一括で：

update public.user_profile set role = 'organizer' where role is null;

将来的に：

role に NOT NULL + CHECK 制約

display_name も Register 実装が固まったら必須化を検討

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

### B-3 の結論としては、こんな感じで固定しておいてよさそう：

起動ゲートを 1 箇所にまとめる

app/index.tsx（またはトップ \_layout.tsx）で、

Supabase Auth → user_profile.role を取得

effectiveRole を決める

本番ビルドでは：

effectiveRole = user_profile.role 固定

'organizer' → ORGANIZER_HOME_ROUTE

'attendee' → ATTENDEE_HOME_ROUTE

DEV ビルドでは：

effectiveRole = devOverrideRole ?? user_profile.role

これまでの DEV Role 切り替え UI をこの devOverrideRole に接続するだけで、
Organizer / Attendee UI の切り替えを維持できる。

Organizer / Attendee の中身（タブ構成や画面遷移）は 既存のものを流用し、
「入り口だけ user_profile.role から自動で振り分ける」変更にとどめる。

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

### C-3：既存ユーザー＋ロールの扱いを決める

ここは データ面の整理 としてやること：

C-3-1: user_profile の既存レコードの方針決め

role が NULL のユーザー → 一律 "organizer" にするのか

それとも初回起動時に /register へ送るのか

C-3-2: 「不完全プロフィール」の定義を確定

例）display_name が空 OR role が空 → /register

逆に「完成プロフィール」の条件も固定する

※ ここは DB と仕様の話なので、コード変更は最小。

### C-4：user_profile.role をアプリの「現在のロール」に配線する

ここがさっき話していた「Attendee パスのテスト」が本当に意味を持つための部分です。

C-4-1: 現在のロール管理の把握

useDevRole（or それに相当する store/hook）

app/(tabs)/\_layout.tsx（Tabs が role をどう使っているか）

DevRoleBadge（黄色バッジが何を上書きしているか）

C-4-2: 「サーバーロール」を一次ソースにする方針を決める

serverRole（Supabase）＋ devOverride（開発用上書き）の関係を決める

例：

本番：serverRole だけを見る

開発：serverRole を初期値として、バッジで一時的に上書き可能

C-4-3: 実装

index で取得した user_profile.role を、ロールストアに流し込む

Tabs や EventsList, Profile が そのストア を見るように変更

DevRoleBadge は「そのストアを一時的に上書きする」形に変更

ここまで終わると、

Supabase の user_profile.role = attendee に変える → 起動直後から Attendee UI

が初めて成立します。

### C-5：Organizer / Attendee のホーム動線の整理

C-5-1: Organizer 起動時

どのタブを初期表示にするか（現状どおり History/Events ベースで OK か）

C-5-2: Attendee 起動時

me/events を最初に出す／Organize タブを隠す などの方針を確定

C-5-3: 実装・テスト

Organizer と Attendee のそれぞれで、起動 → ホームが意図通りか確認

## フェーズ D（あとでで OK）：Join / 招待トークンとの統合

ここは B で方針だけ触れていた部分を、最後にまとめてやる想定。

D-1: 「招待リンクから来た人」が Register をどう通過するか

D-2: 既存の join フローと user_profile / role の整合性

---

# ① どの画面が Session / Guest を参照しているか

| 画面 / ルート                             | 役割                                       | 参照 ID                                             | 根拠（主なファイル）                                                                                                |
| ----------------------------------------- | ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **/(tabs)/events**（タブ「History」）     | 履歴一覧（作成/参加の集約）                | **Guest**（端末ローカルの擬似 UID）                 | `app/(tabs)/events.tsx` → `screens/EventsList.tsx`（`getGuestId()`, `getGuestIdShort()`）                           |
| **/(tabs)/organize**（タブ「Organize」）  | イベント作成＆最近のイベント表示           | **Guest**（作成者 `created_by` に使用）             | `app/(tabs)/organize/index.tsx`（`createdBy = await getGuestId()` → `createEvent({ p_created_by: createdBy, … })`） |
| **/(tabs)/organize/events/[id]**          | イベント詳細（参加者側のチェックイン含む） | **Guest**（出席 `attendance` 挿入時の `user_id`）   | `app/(tabs)/organize/events/[id].tsx`（`user_id: await getGuestId()`）                                              |
| **/(tabs)/organize/events/[id]/checkin**  | 主催者のチェックインリスト                 | **ID 不要**（ユーザー ID は使わず、eventId で集計） | `app/(tabs)/organize/events/[id]/checkin.tsx`（eventId ベースの一覧・集計）                                         |
| **/(tabs)/organize/events/[id]/invite**   | 招待用情報                                 | **ID 不要**（eventId のみ）                         | `app/(tabs)/organize/events/[id]/invite.tsx`                                                                        |
| **/(tabs)/organize/events/[id]/settings** | イベント設定                               | **ID 不要**（eventId のみ）                         | `app/(tabs)/organize/events/[id]/settings.tsx`                                                                      |
| **/(tabs)/organize/admin/[eventId]/live** | Live 管理（リダイレクト）                  | **ID 不要**（eventId のみ）                         | `app/(tabs)/organize/admin/[eventId]/live.tsx`（`/organize/events/${eventId}/live` へリダイレクト）                 |
| **/(tabs)/profile**                       | 現在ロール／Guest ID 表示                  | **Guest**（表示＆トグル）                           | `app/(tabs)/profile/index.tsx`（`useRoleStore`, `getGuestId` の表示）                                               |
| **/(tabs)/debug**                         | セッション/環境の可視化                    | **Session**（表示）※動作は ID 非依存                | `app/(tabs)/debug.tsx`（`supabase.auth.getSession()` 表示）                                                         |

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

## Dev ロールスイッチ ON/OFF メモ（現行構成ベース）

### 1. 役割分担の整理

stores/devRole.ts

devSwitchEnabled()
→ 「Dev ロールスイッチ（バッジ＋ Debug タブ）を有効にするか？」の唯一のスイッチ

useEffectiveRole()
→ 実際に画面で使う role（organizer/attendee）を返す。
Dev スイッチ ON のときはローカル override を反映、OFF のときは Supabase の role だけ使う設計。

app/\_layout.tsx

const enableDev = devSwitchEnabled();

enableDev が true のときだけ DevRoleBadge を表示。

起動時ログに [dev-switch] enableDev = ... が出る。

app/(tabs)/\_layout.tsx

const enableDev = devSwitchEnabled();

useEffectiveRole() でタブの表示内容を切り替え。

enableDev が true のときだけ Debug タブに href が付き、
role === "attendee" && !enableDev のとき Organize タブを非表示にする。

### 2. Dev ロールスイッチを「完全 OFF」にする方法（本番想定）

目的：

DevRoleBadge 非表示

Debug タブ非表示

Attendee は Organize タブにアクセスできない

role は Supabase の user_profile のみで決まる（ローカル override 無効）

やること：

stores/devRole.ts を開く。

devSwitchEnabled() を次のように固定する（メモ用の例）：

export function devSwitchEnabled(): boolean {
return false;
}

保存して、npx expo start -c でキャッシュクリア＋再起動。

Metro ログで次を確認：

[dev-switch] enableDev = false が出ていること。

実機で確認：

画面右下などに DevRoleBadge が出ないこと。

タブバーに Debug タブが出ないこと。

attendee アカウントでログインした場合、Organize タブが表示されない（またはタップできない）こと。

organizer アカウントでは Organize タブが表示され、通常通り使えること。

### 3. Dev ロールスイッチを「ON」にする方法（開発用）

目的：

DevRoleBadge を表示して、画面から Organizer / Attendee を切り替えて挙動を確認する。

Debug タブも一時的に表示して使えるようにする。

やること：

stores/devRole.ts を開く。

devSwitchEnabled() を一時的に次のようにする：

export function devSwitchEnabled(): boolean {
return true;
}

（あとから環境変数ベースの式に戻すなら、ここを調整する）

保存して、npx expo start -c で再起動。

Metro ログで次を確認：

[dev-switch] enableDev = true が出ていること。

実機で確認：

画面右下に DevRoleBadge が表示されること。

Badge から Organizer / Attendee を切り替えたときに：

History タブの文言（説明テキスト）が role に合わせて変わること。

Organize タブの中身も role に応じて挙動が変わること（今は organizer だけが Create event を表示、attendee なら作成 UI は非表示など）。

タブバーに Debug タブが表示されること。

### 4. 将来の運用方針（メモだけ）

ローカル開発：

devSwitchEnabled() を true 固定、または **DEV** ベースの式にしておく。

ストア提出用ビルド：

devSwitchEnabled() を false 固定にしてビルドする。

必要なら、あとで：

devSwitchEnabled() の中で **DEV** や process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH を使う形に拡張する。

## 12 人 ×14 日テスト

### ■ 公式サイト

サイト名：12 Testers

URL：12testers.com
12 testers

運営：Remob Academy LTD（イギリス登録）
Google Play
+1

ここから申し込めば OK です。
トップにでかく 「Test Your App For 14 Day ! 12 Testers !」 と出ているサイトです。
12 testers

### ■ 有料プラン名（12testers.com）

全部「12 人のテスターが 14 日間テスト」がベースで、主に違うのはアプリサイズ・サポート内容です。
12 testers

-Starter Plan

目安価格：$22.99 / app

対象：アプリサイズ 1〜250MB

内容：12 台の実機で 14 日間フルテスト

-Pro Plan

目安価格：$26.99 / app

対象：アプリサイズ 1〜500MB

Starter の内容＋

AnyDesk でのリモートサポート

提出プロセスのガイダンス付き

-Bulk Plan

目安価格：$34.99〜（複数アプリ向け）

5 本以上まとめてテストしたい人向け

-Business Plan

目安価格：$59.99 / 10 apps（まとめ割）

Ken 向けの現実的な選択肢：

アプリ 1 本だけなら
👉 Starter Plan（安くて十分）か
👉 「サポート付きが安心なら」Pro Plan

## unmatched root について

1. 最初の症状（2 つあった）
   (1) ロールが反映されない問題

条件：Expo Go の「ストレージ削除 / Clear storage」後に起動

フロー：

/index → セッションなしなので /join へ

/join で Organizer ユーザーとして Sign In

そのままタブ画面に遷移するが、UI は Attendee 用になる

DB 上では user_profile.role = "organizer" なのに、UI は attendee 扱いになっていた。

原因

/join でログイン成功後、user_profile を読まずに 直接タブへ遷移していた。

useDevRoleStore.setServerRole() が一度も呼ばれず、serverRole が null のまま。

useEffectiveRole() は
ENABLE_DEV = false のため serverRole ?? "attendee" → "attendee" を返す。

(2) Unmatched Route 画面

フロー：アプリ起動 → /join でログイン → Sign In ボタンを押した直後 に
黒背景の 「Unmatched Route / Page could not be found」 が表示される。

Sitemap 画面を見ると、ルート一覧には

index.tsx（/）

(tabs)/\_layout.tsx

events/[id].tsx（/events/[id]）

register.tsx（/register）

などが見える。

ログには：

[index] user_profile found. role = ...
[index] redirect -> /(tabs) with role = ...

の後に Unmatched Route が出ていた。

2. ロール問題に対して行ったこと（join.tsx）
   変更前

join.tsx のログイン後の遷移先：

定数：AFTER_LOGIN_PATH = "/(tabs)/events";

Sign In 成功後：

if (!tokenInUrl) {
router.replace(AFTER_LOGIN_PATH);
}

sessionUserId を監視する auto-nav でも同じく router.replace(AFTER_LOGIN_PATH)。

→ /index を通らないため、user_profile を読んで serverRole をセットする処理が一度も走らない。

変更内容

方針：ログイン後のルート初期化は /index に一元化する。

AFTER_LOGIN_PATH を "/" に変更。

Sign In 成功後も、sessionUserId を検知した auto-nav も、すべて router.replace("/") に変更。

これで：

/join でログイン成功

いったん /（app/index.tsx）へ移動

/index が Supabase から user_profile を取得し、setServerRole() を呼ぶ

その後、タブへ遷移

という流れになり、ロールの初期化処理が必ず実行されるようになった。

結果

Organizer ユーザー・Attendee ユーザーの両方で、

Clear storage → 起動 → /join → Sign In

期待どおり Organizer UI / Attendee UI が表示されることを確認。

3. Unmatched Route 問題に対して行ったこと（index.tsx）
   原因

app/index.tsx の最後の遷移がこうなっていた：

console.info("[index] redirect -> /(tabs) with role =", effectiveRole);
router.replace("/(tabs)");

/ (tabs) は expo-router の「グループ名」であり、実際の画面ではない。

Expo Router 的には「/(tabs) というパスに対応するスクリーンが存在しない」状態。

その結果：

目的の画面にマッチせず

NotFound 用のパス /--/ にフォールバック

黒い Unmatched Route 画面が表示されていた。

※ Sitemap に /events などは出ていたが、「ルートが / (tabs) だけ」のスクリーンは存在していなかった。

変更内容

行き先を「実在する画面」に変更：

router.replace("/(tabs)") → router.replace("/(tabs)/events") に変更。

/ (tabs)/events は、app/(tabs)/events.tsx に対応する実際の画面。

expo-router では /events でも / (tabs)/events でも OK だが、少なくとも「スクリーン付きのパス」になる。

結果

Sign In 後の Unmatched Route 画面は消え、

ログでも
redirect -> /(tabs)/events with role = ... の後、正常に TabLayout と EventsList が描画されるようになった。

4. まだ残っている WARN とその意味
   (1) expo-notifications の WARN / ERROR
   WARN `expo-notifications` functionality is not fully supported in Expo Go
   ERROR expo-notifications: Android Push notifications ... was removed from Expo Go with SDK 53.

内容：

Expo Go では リモート Push 通知 がサポートされなくなった。

Push をちゃんと使いたい場合は Dev Client（development build）を使ってね という案内。

影響：

位置情報や出欠機能、タブ UI、ロール切り替えには影響なし。

Push 機能だけが Expo Go 上では動かない。

対処タイミング：

本当に Push を実装・テストする段階で、

eas build --profile development --platform android

Dev Client で起動

その時点でこの WARN/ERROR は消える想定。

現状：

無視して OK （ログがうるさいだけの存在）。

(2) [Layout children] の WARN
WARN [Layout children]: No route named "organize/admin/[eventId]/live" exists in nested children: [...]

内容：

旧ルート organize/admin/[eventId]/live 向けに残しているレガシー画面（リダイレクト用）と

タブの children 一覧との整合性チェックで、「この名前のルートが children に見当たらない」と警告している。

影響：

実際に使っているのは /organize/events/[id]/live 側。

現在の UI / 機能には影響なし。

将来やるなら：

完全に整理したくなったタイミングで、

Tabs.Screen name="organize/admin/[eventId]/live" を削除するか、

レガシーファイル app/(tabs)/organize/admin/[eventId]/live.tsx を整理する。

現状：

致命ではなく、技術的負債寄りの WARN。急ぎではない。

5. 将来同じような問題が起きたときのミニチェックリスト

まず Sitemap を見る

Unmatched Route が出たら、右下の「Sitemap」をタップ。

現在のパスとルート一覧を確認。

「飛ぼうとしているパス」がルート一覧に存在するかチェックする。

index / join の遷移先を確認する

セッションチェックや profile 読み込みをしている画面（今回なら /index）を特定。

ログイン後に 必ずそこを経由する設計になっているか（router.replace("/") など）を確認。

途中で直接タブや別画面に飛んでいないかを見る。

expo-router のグループ名に注意

app/(tabs)/... の (tabs) は URL に現れないグループ名。

router.replace("/(tabs)") のように、グループだけのパスには飛ばないようにする。

必ず実在するスクリーン（例：/events / / (tabs)/events）に飛ぶ。

ログで流れを追う

console.info で

セッション有無

user_profile の role

router.replace の行き先

を出しておくと、どこで何に飛んでいるか後から追いやすい。
