# GeoAttend — GPS + QR Attendance for Small Groups

GeoAttend is a lightweight attendance app for small teams and clubs. It combines **GPS geofencing + QR check-in** so organizers can record who actually showed up on-site—without using spreadsheets or heavy HR tools.

## ✅ Google Play (AU/NZ)
- Download: https://play.google.com/store/apps/details?id=com.kenta0015.geoattendance.internal  
- Last updated: Dec 26, 2025  
- Release status: **early-access / limited rollout** (availability may be region-limited)

---

## Why this exists
Small teams and clubs often track attendance via paper lists, spreadsheets, or “react in the group chat.” It’s easy to start, but it breaks when you need:
- a reliable history of **who actually attended on-site**
- consistent check-in timing (late arrivals, partial attendance)
- something simpler than enterprise time-tracking systems

GeoAttend is built for **outdoor groups and recurring meetups** (running clubs, hobby groups, study meetups) where “good enough + trustworthy” matters.

---

## What you can verify quickly
- **Location-verified attendance** using GPS geofencing + QR fallback
- Organizer + attendee flows in one app (easy to demo both sides)
- Supabase-backed auth + data access control (RLS)

**Reliability validation (controlled tests):**
- **25/25** successful proximity check-ins within **100m**
- **0** false unlocks across **10** out-of-range attempts (**300m+**)

> This repo is shared primarily as a **portfolio/code review** project for job applications.

---

## Core flow (how it works)
1. Organizer creates an event with **location + radius**
2. Organizer shows an **event QR code** on-site
3. Attendee scans the QR code, then the app:
   - reads event details
   - gets current GPS location
   - verifies the attendee is **inside the geofence**
   - stores a check-in record in Supabase
4. Organizer/attendee can view attendance history

---

## Features

### Organizer
- Create events (date/time + geofence radius)
- Display QR code for fast on-site check-in
- View real-time check-in list + attendance history
- Optional invite links and simple participation/ranking views

### Attendee
- Join via invite link or QR scan
- Check in only when **inside the event area**
- View personal attendance history

---

## Tech stack

**Mobile**
- React Native (Expo)
- Expo Router (navigation + deep linking)
- TypeScript
- Expo Location (GPS/geofence checks)
- Expo Camera / barcode scanning (QR)

**Backend**
- Supabase (PostgreSQL + Auth)
- Row Level Security (RLS)
- SQL functions/policies for safe access and check-in rules

**Tooling**
- Git/GitHub
- EAS Build + Google Play distribution
- Debugging via Expo DevTools + device logs

---

## Architecture (high level)
GeoAttend is a client–server app:
- Mobile client handles UI + GPS/QR logic
- Supabase stores persistent data and enforces access control via **Auth + RLS**

**Key components**
- Auth: Supabase Auth
- Data: events, memberships, check-ins stored in Postgres tables
- Security: RLS policies restrict reads/writes by user + membership
- Check-in: client validates geofence; server stores check-in record

---

## Getting started (local)

### Prerequisites
- Node.js + npm (or yarn)
- Android device or emulator
- Supabase project (free tier works)
- Expo CLI (optional; `npx expo start` is enough)

### 1) Install
```bash
git clone https://github.com/your-username/geoattend.git
cd geoattend
npm install
# or
yarn install
```

### 2) Environment variables
Create a `.env` file:
```bash
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON=your-supabase-anon-key
EXPO_PUBLIC_ENABLE_DEV_SWITCH=true
EXPO_PUBLIC_QR_SECRET=your-secret-value
```

### 3) Supabase schema
You’ll need tables for:
- events
- event memberships
- attendance / check-in records
- (users handled by Supabase Auth)

This README does not include full SQL yet (portfolio-first repo).
If you want to reproduce the backend, inspect the Supabase queries in the codebase and create equivalent tables + RLS policies in your project.

### 4) Run
```bash
npx expo start
```
Then:
- press `a` for Android emulator, or
- scan the QR code using Expo Go on Android

---

## Demo (for reviewers)
Fastest way to evaluate GeoAttend:
- Use the **Google Play** link above (availability may be limited), or
- Run locally with your own Supabase project

Suggested demo path:
1. Sign up (Supabase Auth)
2. Create an event (organizer)
3. Show QR code
4. Join + check in (attendee) near the event location
5. Review check-in history

---

## Limitations / notes
- **GPS accuracy varies** by device, environment, and battery optimization.
- iOS behavior may differ (location permission differences); development/testing has been Android-first.
- Designed for small groups and meetups—not legal-grade attendance compliance.
- Backend policies/schema may need adjustment if reused for other products.

---

## Screenshots

**Organizer – event dashboard & history**  
![Organizer event history](screenshots/01-organizer-history.png)

**Organizer – create geofenced event**  
![Create event](screenshots/02-create-event.png)

**Organizer – show QR code for check-in**  
![Show QR code](screenshots/03-show-qr.png)

**Attendee – event detail + GPS check-in**  
![Attendee event detail](screenshots/04-attendee-event-detail.png)

**Attendee – personal attendance history**  
![Attendee history](screenshots/05-attendee-history.png)

---

## License / usage
This repository is shared for portfolio review and learning.
You may browse and reference ideas/snippets. For commercial reuse of major parts, please contact me.
