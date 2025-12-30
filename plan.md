# Real-Time Attendance — Final Execution Plan (Step 0–7)

**Scope:** Outdoor first, ~30 participants per event. Initial rollout in Australia (Pixel 6a test device).  
**Tech posture:** Expo Go until Step 6 (no prebuild), then minimal Dev Client for notifications/geofencing.  
**Core differentiation:** Hybrid arrival (GPS + rotating QR), rank fairness, rescue UX, role tags, invites + .ics, safety (ICE/checkout), monthly league (EN) and sponsor perks based on attendance threshold.

---

## 0) Dev Posture (one-time)⇒DONE!!

- Run with Expo Go only:
  - `npx expo start --go --tunnel -c`
- Dependency discipline:
  - Add deps via `npx expo install <pkg>` only.
  - Save exact versions; commit lockfile; `npx expo doctor --fix-dependencies`.
- Permissions UX:
  - Require “While in use” + Precise ON. If Precise OFF, lock “Arrived!” and deep-link to Settings.
- Dev telemetry (dev only): log `accuracy_m`, request elapsed, `battery%`.
- Mock detection: surface `mocked` flag as “Needs review” in Live list (no auto-ban).

**Definition of Done (DoD):** Tunnel stable on device, dependencies installed only via `expo install`, Precise-required UI works.

---

## Step 1) Server & Data (minimal, privacy-first)⇒DONE!!

- **Events:** add `event_timezone`, `radius_m`, `grace_in_min=5`, `grace_out_min=10`, `venue_preset('park'|'city'|'beach')`.
- **Attendance:** add `method('gps'|'qr')`, `accuracy_m`, `dwell_s`, `mock_flag`.
- **New tables:**
  - `event_qr_tokens(event_id, token_hash, expires_at, created_by)` – rotating QR (45 s).
  - `invite_tokens(event_id, token_hash, expires_at, redeemed_by)` – invite links.
  - `event_members(event_id, user_id, role text[])` – role tags (Pacer, Sweeper, Photographer).
  - `user_profile(user_id, ice_name, ice_phone)` – safety.
  - `event_checkouts(event_id, user_id, checkout_time)` – “I’m home” confirmation.
- **Storage policy:** no continuous tracks; store only arrival/departure timestamps and accuracy. Retain 30 days.
- **RLS:** participants see own data; organizers see their group; all manual corrections are audit-logged.
- **Pin editing:** participants forbidden; organizers only, with audit log.

**APIs/RPC (names only):**  
`finalize_arrival(event_id, user_id, accuracy_m, dwell_s, method)` (atomic rank on server time)  
`issue_qr_token(event_id)` → `redeem_qr_token(event_id, token)`  
`redeem_invite_token(event_id, token)`  
`mark_checkout(event_id, user_id)`

**DoD:** UTC persisted, local TZ rendered; RLS and auditing active; QR arrival works; no continuous tracks stored.

---

## step 2) Outdoor MVP (Expo Go, foreground only) >>Done!!

- **Foreground location:** `watchPosition` with `interval 15–30 s`, `distanceFilter 25–50 m`.
- **Arrival rule:** venue preset radius + `accuracy ≤ 50–75 m` + `dwell ≥ 10 s` → unlock **Arrived!**.  
  Submit to `finalize_arrival`:
  - Rank is assigned by **server receive time**; ties break by better `accuracy`, then `user_id`.
- **Live list:** present/“maybe away” badge (no update ≥ 3–5 min), medals for ranks 1–3.
- **Hybrid arrival:**
  - GPS = default.
  - QR = rotating token (45 s). Awards on-time credit only; excluded from Top-3.
- **Invites + calendar:** deep-link `rta://join?token=...`; one-tap `.ics` (TZID, venue URL).
- **Rescue UX:** if Precise OFF → Settings; if poor accuracy/indoors → big CTA to QR; if network timeouts → retry (15 s).
- **Safety:** ICE fields and “I’m home” checkout button.

**DoD (measured on Pixel 6a):**

- False arrivals ≤ 2% on parks/beaches. In urban canyons, QR rescue success ≥ 95%.
- Battery ≤ 8% per hour (foreground).
- Live and History sync instantly; `.ics` download and invite join flow work.

---

### 未テスト：超簡易スモークテスト（2 手順だけ）

QR：同一 QR を連続スキャン → 1 回だけカウントされることを見る（3s デバウンス確認）。

GPS：半径内で 10 秒待ち →「Arrived」を押す → Live に自分が出れば OK。
（精度が悪いときは QR 誘導が出る＝正常）

後回しメモ（すぐ再開できる用）

HTTPS ブリッジ：/e/<id>→rta://events/<id>、/j/<tok>→rta://join?token=<tok> を Cloudflare Workers で作成。ICS の URL/本文はこの https に差し替え。

QR TTL 強制：サーバ RPC で now() とトークン発行スロットを照合（±45s 以内のみ有効）。

Precise 誘導：精度不足 or 位置権限が“おおよそ”の時は「設定を開く」ボタン（Linking.openSettings() / Android は ACTION_LOCATION_SOURCE_SETTINGS）。

Safety：プロフィールに ICE フィールド、イベント詳細に “I’m home”（退場記録の簡易 RPC）。

## step 3) AU Pilot (3 locations × 3 events)>> Done!!

- **Locations:** park, urban canyon, beach; each with 10–30 participants.
- **Metrics:** false/ missed arrivals, avg accuracy, rank inversions, QR rescue rate, battery, Precise-OFF rate, ICE/checkout usage.
- **Adjustments:** fine-tune radius presets; tweak “maybe away” window (3–5 min).

**Go criteria:** false ≤ 2% (park/beach); QR rescue ≥ 95% (urban); rank inversions ≤ 1%; battery ≤ 8%/h.

## Step 3) AU Pilot（3 locations × 3 events）結果

実施サマリ

Home（屋内 QR／3A）：合格（前回テスト）

Park（屋外／本日）

GPS @75m（Refresh なし）：安定時間 10s（=dwell）、flip=0、到着後に数値が跳ね戻りあり（仕様上問題なし）→ Pass

GPS @85m（150m 手前で Refresh あり）：安定時間 10s、flip=0、到着後 ±5〜15m へ収束 → Pass

QR（屋外）：今回は未再実施（過去テストで Pass。日陰・角度調整で安定）

City/Beach：未実施（次回対象）

観察ポイント

距離表示は移動中に段階的に変化・到着後に一時的な跳ねあり（再到着は無視されるため実害なし）。

誤到着なし。運用上はスムーズにチェックイン可能。

まとめ判定

全体：合格（Go）

GPS は 75/85m いずれも運用可能。

QR は救済手段として有効。

### 運用決定 & SOP v1.0

決定パラメータ（当面の既定値）

accuracy ≤ 75m、dwell = 10s

radius（会場ごとに選択）

標準：75m

悪条件プロファイル：85m（建物影・樹木多め等）

QR 救済：常時有効（回転 QR）

SOP v1.0（現地運用）
参加者端末（Android）

目的地 150m 手前で「REFRESH GPS (HIGH ACC)」を 1 回

半径内に入ったら 10s 静止 → ボタン有効化 → Arrive

30s 出ない場合：REFRESH をもう一度

それでも不可／精度が不安定：QR に切替

主催端末（PC/2 台目）

/organize/events/[id]/qr を常時表示（明るさ最大・日陰・スリープ無効）

/organize/events/[id]/live で到着反映を確認

フォールバック

Tunnel 切断：PC で Ctrl+C → npx expo start --tunnel -c → 端末は Reload/再スキャン

さらに不安定：USB テザリング＋ LAN へ切替 → npx expo start -c

QR 読みにくい：画面を日陰へ／30–50cm／少し角度

ログ最小ルール

event_id / radius_m / method(gps|qr) / result

安定時間（In-range→ 押下可まで） / flip 回数 / accuracy_m（到着時）

battery 開始 → 終了%、一言メモ

変更が必要になる条件（将来の目安）

標準会場でも安定時間の中央値 > 25s が継続

flip 多発（≥3/回）や到達不可が散見
→ そのときのみ accuracy 閾値を 90–100m、または dwell を 12–15s に再設計（帰宅後に実施）

---

## step 4) Late/Early (practical outdoor logic)

- **Arrival time:** moment conditions are true and server receives event.
- **Late:** `arrival_time > start + 5 min`.
- **Left-early:** `last_valid_seen < end − 10 min`.
- **UX:** badges in Live list with reason tooltip (±m, 10 s dwell).
- **Manual correction:** organizer can adjust with required reason (audit).

**DoD:** ≤ 2% misclassification; organizer edits reflect immediately and are audit-logged.

---

対象

event_id: 40eccf82-5635-422f-b0e2-a8b9d46b0508

user_id: bbd182e7-2e68-4c3d-8712-05d806d2f0f0

実施／確認（更新）

✅ Live 集計＝ DB 一致（attendance_status の集計と UI タイルが一致）

✅ Finalize しても集計値は不変、ヘッダーが Using finalized ranks に変化（並びのみ固定）

✅ Finalized 中でも attendance_override 変更でタイル/バッジが即反映（Left early 1→0→1 を確認）

✅ CLEAR FINALIZED → ヘッダーが Using live order に戻る
REBUILD RANKS → finalized 再作成、集計値は不変

✅ UI の権限制御：未ログイン時、Finalize/Clear/Rebuild/EDIT は無効＋「Sign-in required」表示

発生した問題と対処（更新）

🛠 finalized 挙動に固定：arrival_result 残存が原因 → 対象イベントで delete from public.arrival_result

🛠 手動 Finalize のエラー：arrival_result.method / checked_in_at_utc が NOT NULL
→ insert 時に method と checked_in_at_utc を必ず指定して解消

🛠 Override 401：未ログインによる RLS → 今回は SQL で検証、UI 保存は今後サインイン後に実施

結論（更新）

Late/Early/Away 判定ロジック：期待どおり動作。

Finalize 運用：

Finalize は順序のみ固定、集計は常に attendance_status を参照

Live へ戻すには CLEAR FINALIZED（=arrival_result 削除）

手動 Finalize する場合は method/checked_in_at_utc 必須

認証まわり：未ログイン時の操作不可が UI に明示されることを確認。

## step 5) Lightweight Anti-cheat

- Accept only positions with `accuracy ≤ 75 m` and `dwell ≥ 10 s`; reject “teleports” (> 150 km/h).
- Android: surface `mock_flag`; tag “Needs review” (no auto-ban).
- Server invariants: first valid arrival locks rank; participant cannot move event pin.

**DoD:** 100% of mocked reports flagged; zero accidental bans; weekly flag rate report.

✅ 通過

T1 正常系：OK

T2 重複抑止（固定連続）：FAIL を返し DB 増えずに修正済み

T3 同一ユーザー 60 秒内：OK（警告＋ DB 書き込みなし）

T5 不正トークン：OK

T6 PIN 監査：OK（PIN ごとに audit 記録）

⚠️ 未完（後で対応）

T4 古い QR：まれに通過する
想定原因：

スロット境界により drift が 1 のまま（90s ぴったり付近）
改善案（どれか一つで可）：

テスト時だけ MAX_AGE_SLOTS=1（45s で失効）に下げる

判定を「スロット差」ではなく経過秒で厳密化：
age_sec := extract(epoch from now()) - slot*PERIOD_SEC;
if age_sec >= MAX_AGE_SLOTS*PERIOD_SEC then raise 'token too old';

余白+5s を設ける（>= 90s - 5 を不許可に）

※EXPO_PUBLIC_QR_SECRET=DEV は
本番に出す前に必ず変更：強いランダム文字列にして、クライアント(.env)とサーバ関数の両方を同じ値に揃える。

## 可視化/レポート（PIN 単位の集計・異常ハイライト）⏳ 任意 は未実装

## step6) Notifications & Geofencing (Dev Client, minimal native)

- **When to prebuild:** only now. Add `expo-notifications`, `expo-task-manager`, `expo-location` geofencing.
- **Android 13+:** runtime POST_NOTIFICATIONS, separate flow for ACCESS_BACKGROUND_LOCATION.  
  Declare Foreground Service (location) with persistent channel. Ensure Google Play services up to date.
- **Notifications:**
  - Participant: local reminder T−15 min; local notification on geofence entry (deep-link to arrival view).
  - Organizer: batched arrival notifications (at most one per 30 s).
- **Geofences:** active only during event window; use re-entry to trigger foreground checks (no continuous background tracking).

**DoD:** organizer notification delay ≤ 5 s; opt-in rate ≥ 80%; background permission flow succeeds.

---

## Notification テスト残り

現状（事実のみ）

Test Notification は出る＝通知レイヤは正常。

Started? = Yes、位置情報/電池最適化も適切。

しかし ENTER/EXIT 通知が来ない（Dev Client / Release APK ともに再現）。

サーバ側：geofence_events と geofence_log() は作成済み、オフライン Queue 実装済み。

直近でコード/ビルド手順に変更あり（影響の可能性あり）。

まず入れる変更（1 ファイルだけ・効果大）

目的：Kill（コールドスタート）でも BG タスクが必ず登録されるようにする。

index.tsx（プロジェクト直下）— フルコード置換
// index.tsx
// Ensure background geofence task is registered on cold starts as well.
import "./lib/geofence";

// Boot Expo Router
import "expo-router/entry";

解説：TaskManager.defineTask(...) は エントリで評価されている必要があります。
ここで ./lib/geofence を常時 import しておけば、Kill 中でも OS からの起動でタスクが確実に登録されます。

すぐできる検証手順（次回スムーズに再現）

EAS で preview を再ビルド（上記 index.tsx 反映）

eas build -p android --profile preview

APK を端末へ入れ替え → 起動 → Sign In

Location Test

Request All Perms → Radius=10–20m → Start Geofence @ current

アプリを Kill → 境界を跨ぐ（同方向は 30 秒以上 間隔）

帰宅 or オンライン復帰後：Location Test → Flush Queue Now

Supabase geofence_events に ENTER/EXIT が 重複なく記録されていることを確認

（通知はサブ機能：来なくても DB 記録があれば合格）

後で迷わないためのチェック項目（設定系）

app.json

android.permissions に ACCESS_BACKGROUND_LOCATION が含まれているか

version / android.versionCode 更新

EAS Secrets：EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 登録済み

デバッグ画面（/organize/location-test 等）は RoleGate / **DEV** で非表示（本番）

リリース後に再開する検証（通知は後追い）

優先：DB 記録の安定（Queue→Flush / Kill 中の ENTER/EXIT 反映）

次点：通知の改善

ベンダー省電力の例外追加（機種依存）

デバウンスと移動距離の調整（連続同方向は 30s 以上）

必要なら 簡易 Task Log（直近の ENTER/EXIT を画面表示）を追加

## step 7) Rewards → Monthly League (EN) → Sponsor Perks

### 7.1 Stamps/Badges

- On-time +1; Top-3 +2/+1/+1 (GPS only, once per event); optional Early-bird +1 (T−5 to 0); Streak 3/5/10 → +1/+2/+3.
- QR arrivals: on-time only; not eligible for Top-3.

### 7.2 Monthly League (English only)

- Metrics: attendance count, Top-3 count, current streak.
- Shareable recap image (EN) generated by Edge Function (target ≤ 1.5 s).
- Retain leaderboards and recap history for 12 months.

### 7.3 Sponsor Perks (attendance threshold)

- Rule: dynamic threshold **X = ceil(0.6 × number_of_events_in_month)**.
- QR arrivals **count toward X** (Top-3 still GPS-only).
- Cap: max 1 perk per user per month.
- Delivery: unique per-user code (offline friendly); stock consumed on claim (“first-come”).
- Data model (concept):
  - `sponsor`, `sponsor_offers`, `reward_rules(scope='monthly', condition={min_attend:X}, prize=offer_id)`,
    `sponsor_awards`, `sponsor_redemptions` with `UNIQUE(user_id, month, offer_id)`.

**DoD:** atomic rank (no duplicates), on-time mis-awards ≤ 1%; month-end batch ≤ 60 s; 1-tap claim, no duplicate grants.

---

## Cross-cutting: , Consent, Localization, Accessibility

- Consent copy must state purpose, 30-day retention, visibility scope, and “not payroll-official”.
- Localization: recap images EN; app strings can be EN/JA later (start with EN).
- Accessibility: large “Arrived!” button, high-contrast QR CTA, screen-reader labels, haptic feedback on state change.

---

## KPIs (acceptance targets)

| Area           | KPI                           | Target |
| -------------- | ----------------------------- | ------ |
| Accuracy       | False arrivals (park/beach)   | ≤ 2%   |
| Urban fallback | QR rescue success             | ≥ 95%  |
| Fairness       | Rank inversions               | ≤ 1%   |
| Battery        | Foreground drain (1 h)        | ≤ 8%   |
| Notifications  | Organizer delay               | ≤ 5 s  |
| Permissions    | Precise OFF rate (post-pilot) | ≤ 15%  |
| Engagement     | Recap image download/share    | ≥ 30%  |
| Safety         | “I’m home” completion         | ≥ 90%  |

---

## Risks → Mitigations

| Risk                     | Mitigation                                                                       |
| ------------------------ | -------------------------------------------------------------------------------- |
| GPS jitter/urban canyons | 10 s dwell, accuracy gate, venue presets, QR rescue front-and-center             |
| Dependency/ABI drift     | No prebuild before Step 6; `expo install` only; lockfile; doctor fix             |
| Cheating/mock apps       | Mock flag, speed sanity checks, first-arrival lock, organizer audit tools        |
| Consent friction         | Clear purpose, minimal data, easy opt-out, QR alternative                        |
| Battery concerns         | Foreground-only checks, distanceFilter/interval tuning, geofence only as trigger |

---

## Timeline (suggested sprints)

- **Sprint 1:** Step 0–1 (RLS, auditing, QR tokens)
- **Sprint 2:** Step 2 (MVP: hybrid arrival, invites + .ics, rescue UX, ICE/checkout)
- **Sprint 3:** Step 3 (AU pilot; finalize presets and windows)
- **Sprint 4:** Step 4–5 (Late/Early + anti-cheat)
- **Sprint 5:** Step 6 (Dev Client, notifications, geofencing)
- **Sprint 6:** Step 7 (Stamps, league EN, sponsor perks, recap images)

---

## Reference presets and rules

- **Venue presets:** Park 75 m, City 120 m, Beach 100 m.
- **Arrival evaluation:** inside radius AND accuracy ≤ 50–75 m AND dwell ≥ 10 s.
- **Ranking tiebreakers:** server receive time → better accuracy → `user_id` ascending.
- **Monthly perk threshold:** `X = ceil(0.6 × events_in_month)`. QR arrivals count toward X. One perk per user per month.

## Dev client 起動法

A) JS だけ変えた日（ネイティブ変更なし）

実機が見えるか確認
adb devices -l（device と出れば OK）

起動
npx expo start --dev-client --tunnel

目的画面へ
adb shell am start -a android.intent.action.VIEW -d "rta://organize/location-test"

B) ネイティブ変更した日（plugins / app.json 権限 変更後）

実機固定でビルド&インストール

$env:ANDROID_SERIAL="26021JEGR06385"
$env:EXPO_NO_ANDROID_EMULATOR="1"
npx expo run:android --device

起動
npx expo start --dev-client --tunnel

目的画面へ
adb shell am start -a android.intent.action.VIEW -d "rta://organize/location-test"

小ワザ

エミュ勝手起動を防止：$env:EXPO_NO_ANDROID_EMULATOR="1"

実機が出ない時：USB 再接続 → 端末で Allow USB debugging → adb devices -l 再実行
