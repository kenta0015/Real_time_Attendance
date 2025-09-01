# Real‑Time Attendance — MVP Delivery Plan (Expo Go, Android First)

**App Name (header): _Real time attendance_**  
**Scope:** Android + Expo Go only (no Dev Client) for Milestones M0–M3.  
**Backend:** Fresh Supabase project (new schema).  
**Auth (MVP):** Guest/dummy user (switchable to Supabase Auth later).  
**Groups:** Enabled from day one (roles: `organizer`, `member`; multiple organizers allowed).  
**Timezones:** Store **UTC**, display in **device local time**.  
**Location policy:** Foreground only; prompt to enable GPS if off.  
**Check‑in rules:** Within radius and time window; one row per user+event (re‑checks update).  
**Comments:** Max 150 chars; presets: “Here now”, “Arriving in 5 min”, “Running late”.  
**Realtime:** Supabase Realtime on `attendance` table (event‑scoped).

---

## 1) Milestones & Acceptance Criteria

### M0 — Project bootstrap (Expo Go + Location sanity)

**Goal:** A clean Expo project that runs instantly on Android device via Expo Go and can read GPS.
**Tasks** - Create new repo & Expo project rta-mvp using ⇒created completely new folder named _zero-RTA_

**expo-router**. - Add expo-location and a minimal Location Test screen. - Wire app start to route to a Home/Tabs with
**Organize** tab available. - Add .env loading and config guard (safe if missing). - Set up ESLint + TypeScript strict, basic CI lint job (optional).
**Acceptance** - On device, open via Expo Go; tap

**Organize ▸ Location Test**; see coordinates & accuracy update.

### M1 — Data model + groups (no auth, guest mode)

**Goal:** Minimal database ready; app uses guest identity to create groups/events.

**Tasks**

- Provision a fresh **Supabase** project.
- Create tables:
  - `groups(id, name, description, created_by, created_at, …)`
  - `group_members(group_id, user_id, role)` with roles `organizer`|`member`
  - `events(id, group_id, title, start_utc, end_utc, lat, lng, radius_m, window_minutes, location_name, created_by, …)`
  - `attendance(event_id, user_id, checked_in_at_utc, lat, lng, accuracy_m, comment)` (PK `(event_id, user_id)`)
  - `event_comments(id, event_id, user_id, body, created_at_utc)`
- Enable **Realtime** on `attendance` (and optionally `event_comments`).
- In app, persist a random **guest ID** locally (AsyncStorage) as `user_id` placeholder.
- Build simple UI: create group, list own groups, create event with **numeric lat/lng inputs** (map picker deferred).

**Acceptance**

- Can create a group and an event (with radius & time window).
- Tables exist and rows insert from the app as guest user.

---

### M2 — Check‑in flow + geofence rules

**Goal:** Users can see an event, distance to venue, and check in if eligible.

**Tasks**

- Event detail screen:
  - Show event title, local time (convert from UTC), venue name, **distance** (Haversine).
  - Show **eligibility**: inside radius AND within `[start−window, end+window]`.
  - Enforce accuracy ≤ `max(50m, radius×2)`; if worse, show warning and **Retry**.
- “Here now” button appears only when eligible; submit check‑in (upsert by `event_id+user_id`).
- Optional free text (≤150 chars) and 3 presets.
- Organizer view (simple): live list of checked‑in users for selected event (Supabase Realtime).

**Acceptance**

- Standing near a test lat/lng (or edited to your current spot), check‑in succeeds; organizer list updates live on second device/session.

---

### Dev-Only Role Switch (Organizer ⇄ Attendee) — Plan(After M2)

**Goal**

Speed up UI/flows verification by allowing local role override during development/demo, without weakening server-side security.

**Scope**

Applies to: Expo Go, development builds only.

Affects: Navigation guards, conditional UI (buttons/sections), and sample data seeding.

Does not affect: Server-side authorization (RLS) or production builds.

**UX / Access**

Entry point (one of these, in order of preference):

Hidden route /\_debug in the app (reachable via manual URL or a tiny “Dev” cog on Profile).

Long-press app title (≥ 3s) opens a Dev Panel modal.

**UI in Dev Panel**:

Role toggle: Attendee | Organizer.

“Clear override” button.

Small badge rendered app-wide: DEV ROLE: Organizer/Attendee.

**Source of Truth & Logic**

Effective role = roleOverride ?? serverRole ?? 'attendee'.

Where stored: in client state (e.g., zustand) under roleOverride.

Persistence: default memory-only; optional AsyncStorage persistence behind a dev flag.

Compile-time guard: Entire Dev Panel and override logic behind **DEV** or EXPO_PUBLIC_ENABLE_DEV_SWITCH === 'true'.

**Feature Gates (examples)**

Organizer-only UI: group/event creation & edit, attendance list (live), reports.

Attendee-only UI: check-in button, comment presets.

Shared: event details, distance/status.

**Realtime & Data**

Realtime: unchanged; subscribe per event_id. The override only changes what we show, not what we’re allowed to mutate.

Server safety (future with Auth/RLS): All writes continue to be validated by RLS; override never grants extra DB rights.

**Test Plan (acceptance)**

A1: With override=Organizer, organizer panels render; with Attendee, they hide immediately.

A2: Realtime attendance list updates when another client checks in.

A3: Override cleared → UI follows serverRole (or falls back to attendee when unauthenticated).

A4: In a production build, the Dev Panel is not reachable, and roleOverride is ignored.

A5: Badge shows only in dev; never in prod.

**Risks & Mitigations**

Risk: Dev switch ships to prod by mistake.
Mitigation: **DEV** guard + CI check grepping for /\_debug and ENABLE_DEV_SWITCH.

Risk: Confusion during demos.
Mitigation: Always show the dev badge when override is active.

Risk: False sense of permission.
Mitigation: Keep RLS tests in a separate checklist before release.

**Tasks (checklist)**

Add Dev Panel entry (hidden route or long-press gesture).

Add roleOverride to client state; compute effectiveRole.

Wrap organizer/attendee UI with gates using effectiveRole.

Add global DEV ROLE badge.

Env flag EXPO_PUBLIC_ENABLE_DEV_SWITCH (default false).

E2E checks for A1–A5 on Android (Expo Go).

CI rule: fail build if dev switch is enabled for production.

**Removal / Production Hardening**

Build-time: Ensure **DEV** is false in release; do not bundle /\_debug.

Runtime: If env flag is off, ignore any stored override; fall back to serverRole.

CI: Script to assert no Dev Panel code/route present in production bundle.

### M3 — UX polish & non‑breaking extras

**Goal:** Smoother organizer and participant UX without introducing Dev Client.

**Tasks**

- Basic “My events” & “My groups” navigation.
- Improve empty/edge states and toasts.
- Optional **map preview** (web embed) for venue (no native maps dependency).

**Acceptance**

- Happy path feels smooth: create event → check‑in → organizer sees it live.

---

### M4 — Hardening & next steps (post‑MVP)

- **Swap guest→Supabase Auth** (email OTP or email+password).
- **Native map picker** + reverse geocoding (requires Dev Client; schedule later).
- **Push notifications** (arrival windows, organizer alerts).
- **RLS** policies to secure groups (organizers manage their groups, users edit own check‑ins).

---

## 2) Product Rules (Finalized)

- **Check‑in window:** Default ±30 min (override per event via `window_minutes`).
- **Radius:** Default **50 m**; min **10 m**, max **200 m**.
- **Accuracy rule:** Must be ≤ `max(50, radius×2)` to accept; otherwise show warning and allow retry.
- **Re‑checks:** Upsert; keep latest timestamp & location.
- **Comments:** Optional; ≤150 chars; presets: “Here now”, “Arriving in 5 min”, “Running late”.
- **Realtime scope:** Organizer view subscribes **only to the active `event_id`**.
- **Permissions:** Foreground location only; if GPS disabled, prompt to enable.
- **Roles & moderation:**
  - `member`: can create groups/events (becomes organizer of created group), can edit/delete **own** check‑ins/comments.
  - `organizer`: can edit/delete **any** check‑in/comment within their group; manage events & membership.

---

## 3) Folder Layout (new project)

```
app/
  _layout.tsx
  (tabs)/
    _layout.tsx
    organize/
      index.tsx                 # groups list + create
      events/
        [id].tsx                # event detail & check-in
      admin/
        [eventId]/live.tsx      # organizer live list
    profile/
      index.tsx
lib/
  supabase.ts                    # client + helpers
  geo.ts                         # distance, accuracy helpers
stores/
  session.ts                     # guest ID, simple settings
_env/
  .env.example                   # EXPO_PUBLIC_SUPABASE_URL/ANON
```

---

## 4) Tech Decisions

- **Expo Go only** until M3: avoids native dependency churn; faster iteration.
- **No native maps** in MVP: venue coordinates entered numerically; optional web preview.
- **UTC storage, local display** for all event/check‑in timestamps.
- **Guest user first** to unblock flows; switch to Supabase Auth later without breaking DB.

---

## 5) Runbook (high level)

1. **Create project**: `npx create-expo-app rta-mvp -t tabs (expo-router)`
2. **Add libs**: `npx expo install expo-location @react-native-async-storage/async-storage`
3. **Env**: Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON` in `.env`.
4. **Device run**: `npx expo start --go --lan` → scan QR in Expo Go.
5. **Tables**: create schema in Supabase; point app to new URL/Anon key.
6. **Ship M0→M3** following acceptance criteria.

---

## 6) Risks & Mitigations

- **Accuracy variance indoors** → encourage outdoors or retry; enforce accuracy cap.
- **Expo Go limits** (no native map picker) → numeric input + web preview; plan Dev Client later.
- **Realtime quotas** → keep subscriptions scoped to single `event_id`.
- **Clock skew** → rely on server time for acceptance when Auth is added; MVP can use device time.

---

## 7) Success Criteria (MVP)

- Create group & event on device.
- Check‑in succeeds within configured radius/window.
- Organizer screen live‑updates without manual refresh.
- No native builds required; all flows run in Expo Go.

## 8) Guest ID – Production Considerations

Currently, the app uses a simple UUID generator (`Math.random()`-based) stored in AsyncStorage.  
This is fine for development, but before production we should improve reliability and security.

**Future improvements to consider:**

1. **Switch to `crypto.getRandomValues` for UUID generation**

   - Reason: `Math.random()` is not cryptographically strong. Using `crypto.getRandomValues` ensures truly unique and secure IDs.

2. **Implement guest → user migration**

   - Reason: When adding login/authentication, we need a way to transfer existing guest data (events, logs, etc.) to the authenticated user account, so users don’t lose history.

3. **Add a "Reset Guest ID" option in settings**
   - Reason: Useful for testing, troubleshooting, or if multiple people share one device. It allows creating a fresh guest profile without reinstalling the app.

## Strategy to differentiate History from Organize

- **Copy**: "History of this device's check-ins (and creations if Organizer)."
- **Actions**: add note, export (CSV/PDF), share proof, quick re-check-in/comment.
- **Signals**: check-in timestamp, GPS accuracy (±m), streaks/counters.
- **Filters**: Created vs Checked-in, group, date range (Today / 7d / 30d).
- **Future**: with login, migrate `guest_id -> user_id` for multi-device history; optionally include RSVP/bookmarks so upcoming items appear before check-in.
