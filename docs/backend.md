# Backend (Supabase)

This document explains GeoAttend’s backend data model and access control (RLS) at a reviewer-friendly level.

> Scope: what tables exist, which ones matter for the app, and how data access is protected.
> Secrets (URLs/keys) are intentionally not included.

---

## TL;DR (Core entities)

GeoAttend is built around:

- **Groups** → a team/club
- **Events** → a scheduled session owned by a group
- **Memberships** → who can see/join what
- **Attendance** → location-verified check-ins (QR + GPS)

---

## Core tables (used by the app)

### `groups`

- `id (uuid)` – group id
- `name (text)`
- `description (text, nullable)`
- `created_by (uuid)` – owner (auth.uid)
- `created_at (timestamptz)`

### `group_members`

- `group_id (uuid)`
- `user_id (uuid)`
- `role (text)` – e.g. member/admin (implementation-defined)

### `events`

- `id (uuid)`
- `group_id (uuid)` – FK to `groups.id`
- `title (text)`
- `start_utc (timestamptz)`
- `end_utc (timestamptz)`
- `lat/lng (double)` + `radius_m (int)` – geofence
- `window_minutes (int)` – check-in time window
- `grace_in_min / grace_out_min (int)` – on-time/late/early rules
- `created_by (uuid)`
- `created_at (timestamptz)`

### `event_members`

Stores who is participating in an event (invite/join/roles/RSVP).
Key columns:

- `event_id (uuid)`
- `user_id (text)` _(note: legacy type; see “Tech debt” below)_
- `role (text[])`
- RSVP-related fields (`rsvp`, `rsvp_status`, etc.)

### `attendance`

Stores actual check-ins.
Key columns:

- `event_id (uuid)`
- `user_id (uuid)`
- `checked_in_at_utc (timestamptz)`
- `lat/lng (double, nullable)`
- `accuracy_m (double, nullable)`
- `method (text, nullable)` – e.g. `qr` / `gps`
- `dwell_s (int, nullable)`
- `mock_flag (bool)` – test marker

### Tokens / QR rotation support

- `event_qr_tokens` (rotating token hashes per event)
- `invite_tokens` (invite/join tokens)

### Optional: device-level geofence logs

- `geofence_events` (enter/exit logs per device/user)

---

## Relationship overview

A simplified mental model:

- `groups (1)` → `events (many)`
- `groups (1)` → `group_members (many)`
- `events (1)` → `event_members (many)`
- `events (1)` → `attendance (many)`

---

## Views (derived / “reviewer candy”)

These views exist to make the app fast to render and easy to validate:

- `attendance_counts` – totals + method breakdown per event (QR/GPS/unknown)
- `attendance_ranked` – attendance with computed rank
- `attendance_status` – late/on-time/left-early classification per attendee
- `v_event_roster*` – roster views for organizer screens
- `v_pilot_metrics` / `v_pilot_ranks` – pilot/validation metrics & ranking summaries

> Review tip: these views demonstrate how raw check-in events become meaningful organizer outputs.

---

## Row Level Security (RLS)

GeoAttend uses Supabase Auth + RLS policies to control which rows users can read/write.

### Strongly enforced (core access boundaries)

**Groups**

- Insert: only the owner can create a group (`created_by = auth.uid()`)
- Select: group owner OR a member can read group rows

**Group members**

- Insert: group owner only
- Select: user can read their own membership rows

**Events**

- Insert: only group owner can create events for their group
- Select: group owner OR a group member can read events

**Geofence logs**

- Insert/select: user can write/read only their own geofence logs

### Notes on current policy strictness

Some tables currently have permissive policies (e.g., wide SELECT/INSERT for `attendance`, `event_members`, etc.) to support rapid pilot iteration.

For a production deployment, these should be tightened to:

- Require `authenticated`
- Require membership checks (group/event membership)
- Enforce server-side constraints for check-in eligibility (time window, geofence bounds, token validity)

This repo includes documentation first; hardening the policies is tracked as an improvement item.

---

## Audit & debugging tables

- `checkin_audit`, `audit_log`, and audit\_\* tables exist to support:
  - debugging edge cases,
  - tracking manual overrides,
  - validating the pilot runs.

---

## Local setup (minimal)

1. Create a Supabase project
2. Configure Expo env vars:

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON`
   - `EXPO_PUBLIC_QR_SECRET` (for QR payload signing/verification)

3. Create tables/views/policies
   - The schema is documented at a high level here.
   - A clean migration export (SQL) can be added later (recommended).

---

## Tech debt / known cleanups

- **Mixed `user_id` types**: some tables use `uuid`, others use `text`.
  - Planned: unify to `uuid` (`auth.uid()` everywhere) or clearly separate “external id” fields.
- **RLS hardening**: lock down currently-permissive tables for production readiness.
- **Token lifecycle**: ensure rotation/expiry and token replay protection remains strict.

---
