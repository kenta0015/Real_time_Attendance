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

## step 2) Outdoor MVP (Expo Go, foreground only)

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

HTTPSブリッジ：/e/<id>→rta://events/<id>、/j/<tok>→rta://join?token=<tok> を Cloudflare Workers で作成。ICSの URL/本文はこの https に差し替え。

QR TTL 強制：サーバRPCで now() とトークン発行スロットを照合（±45s以内のみ有効）。

Precise誘導：精度不足 or 位置権限が“おおよそ”の時は「設定を開く」ボタン（Linking.openSettings() / Androidは ACTION_LOCATION_SOURCE_SETTINGS）。

Safety：プロフィールに ICE フィールド、イベント詳細に “I’m home”（退場記録の簡易RPC）。

## step 3) AU Pilot (3 locations × 3 events)

- **Locations:** park, urban canyon, beach; each with 10–30 participants.
- **Metrics:** false/ missed arrivals, avg accuracy, rank inversions, QR rescue rate, battery, Precise-OFF rate, ICE/checkout usage.
- **Adjustments:** fine-tune radius presets; tweak “maybe away” window (3–5 min).

**Go criteria:** false ≤ 2% (park/beach); QR rescue ≥ 95% (urban); rank inversions ≤ 1%; battery ≤ 8%/h.

---

## step 4) Late/Early (practical outdoor logic)

- **Arrival time:** moment conditions are true and server receives event.
- **Late:** `arrival_time > start + 5 min`.
- **Left-early:** `last_valid_seen < end − 10 min`.
- **UX:** badges in Live list with reason tooltip (±m, 10 s dwell).
- **Manual correction:** organizer can adjust with required reason (audit).

**DoD:** ≤ 2% misclassification; organizer edits reflect immediately and are audit-logged.

---

## step 5) Lightweight Anti-cheat

- Accept only positions with `accuracy ≤ 75 m` and `dwell ≥ 10 s`; reject “teleports” (> 150 km/h).
- Android: surface `mock_flag`; tag “Needs review” (no auto-ban).
- Server invariants: first valid arrival locks rank; participant cannot move event pin.

**DoD:** 100% of mocked reports flagged; zero accidental bans; weekly flag rate report.

---

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

## Cross-cutting: Privacy, Consent, Localization, Accessibility

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
