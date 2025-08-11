(Note) ✅doesnot mean it is done

# 🧭 Full Roadmap (Organized by Phase)

## 🟩 Phase 1: Minimum Discovery Experience (Completed)

Group search

Join groups

View and register for events

## 🟩 Phase 2: GPS Attendance Tracking (Logic complete, UI missing)

Goal: Make the attendance experience visible and interactive.

✅ Step 2.1: Implement /event/[id].tsx Screen
Event Details:

Display event name, time, and location (with map)

Show distance indicator (user's current distance from event)

Show real-time attendance status (e.g., "Attendance Possible")

✅ Step 2.2: Check-In UI
"I’ve arrived!" button (appears within 50m range)

Show confirmation animation/feedback

Allow sending a check-in comment (e.g., "Arriving in 5 min")

## 🟨 Phase 3: Real-Time Status and Attendance Display

Goal: Visualize attendance data and other attendees.

✅ Step 3.1: Attendance List UI (mainly for organizers)
Show list of attendees (present/late/not arrived)

Display comments from each participant

✅ Step 3.2: Active Event View
Real-time attendee count

Event timer / countdown

UI that reflects live status updates automatically

## 🟧 Phase 4: Organizer Tools

Goal: Allow organizers to create and manage groups/events.

✅ Step 4.1: Group/Event Creation UI
Group creation form (name, category, etc.)

Event creation with location picker (Google Maps)

✅ Step 4.2: Management & Reports
Edit/delete events

View attendance reports (basic)

Manage group members

## 🟥 Phase 5: Communication and UX Improvements

Goal: Polish the app into a complete product.

✅ Step 5.1: Event Comments / Chat Feature
Enable event-specific chat (DB already prepared)

✅ Step 5.2: Profile and History Features
Profile edit screen

Attendance history list

Graph of personal attendance stats

✅ Step 5.3: Notifications and Offline Support
Push notifications (via Expo Push or OneSignal)

Offline data handling (e.g., queue and resend)

## 🧪 Development Notes & Recommended Environment

下記のエラーが表示された

❌ Your project uses SDK 50
✅ Your Expo Go supports SDK 53 only

つまり：

現状 結論
あなたのアプリ Expo SDK 50（安定構成）
iPhone の Expo Go SDK 53 以降専用（強制アップデートあり）
結果 起動不可（Expo Go では）

GPS feature must be tested on a physical device (not possible with ThinkPad alone)

Map + GPS logic works best on Expo Go (not web)

UI implementation should be done step-by-step using tab screens or modals

Zustand already separates organizer/attendee state, so implementation is manageable

# ✅ Realistic Development Roadmap (With iPhone Requirement Notes)

## ✅ Recommended Development Steps (Summary)

Build out the UI via Web for:

Phase 1 → 2.1

Phase 3, 4, 5.1–5.2

After purchasing an Android device:

Test GPS-based features (Phase 2.2)

Finalize:

Add push notifications and offline support (Phase 5.3)

If needed:

Prepare iOS build using TestFlight or EAS Build with Apple Developer account

## Actual whole plan

Phase Feature Description Test Method Physical Device Required?

🟩 Phase 0: Role Confirmation and Guards (Do First / Small Tasks)
0.1 Assign Default Role
If profiles.role is empty for existing users, bulk-assign attendee (SQL is fine).

0.2 Dev-Only Role Toggle
During development only, allow switching between organizer / attendee via the UI (header or hidden menu).

0.3 Screen Guard
When directly accessing a Group-related page, redirect attendee users to /events.

0.4 Final RLS Check
Ensure that access is blocked via Supabase policies, without relying solely on UI-based display control.

🟩 Phase 1 Group search, join, and event listing ✅ Fully testable on Web ❌ Not required

🟩 Phase 2.1 /event/[id].tsx – Map display & distance UI ✅ UI testable on Web (limited map support) ❌ Not required (map behavior check on real device recommended)
⇒Done!! BUT UI layout and database connectivity only.Location permission enabled and Developer mode on are not finished yet.

🟨 Phase 2.2 GPS-based UI (check-in button, comments) 🚫 Not testable on Web → ✅ Requires Android device ✅ Physical device required (Android or iPhone)

🟨 Phase 3.1 Attendance list view (real-time) ✅ Fully testable on Web ❌ Not required (display only)
⇒Done!!
🟨 Phase 3.2 Active event view (live attendee count, status) ✅ Web + Supabase integration testable ❌ Not required (GPS testing separate)
⇒Done!!

🟧 Phase 4 Organizer tools (create/edit groups/events) ✅ Fully testable on Web ❌ Not required

🟥 Phase 5.1 Chat feature (Supabase-ready) ✅ Web or Android ❌ Not required

🟥 Phase 5.2 Profile & history screens, stats graph ✅ Fully testable on Web ❌ Not required

🟥 Phase 5.3 Push notifications, offline handling ✅ Android can test fully ⚠️ iOS push requires Apple Developer Program

## ✅ Summary: Phases That Require a Physical Device

Phase Feature Testing Timing
✅ Phase 2.2 GPS proximity detection (within 50m) After Android device is acquired
⚠️ Phase 5.3 Push notifications (iOS only) After Apple Dev Program registration (if needed)

## 📱 Recommended Android Devices (GPS Accuracy & Stability Focus)

Model Notes Approx. Price
Google Pixel 5/6/7 Excellent GPS accuracy, stable, dev-friendly $150–$300 (used)
Samsung Galaxy A52/A53 Good GPS, popular, cost-effective ~$150+
Motorola G Power (2021+) Low-cost but reliable GPS, great for dev use ~$100+
Xiaomi Redmi Note series Best value, caution with Chinese ROMs ~$100+

Requirements:

Android 10 or higher

Google Play support (avoid Chinese ROMs)

USB debugging available (Developer mode enabled)
