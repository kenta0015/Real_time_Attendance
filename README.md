# 📱 Real-Time Attendance App

## 🎯 App Purpose

This app allows organizers to check **real-time attendance** at events or meeting locations. Organizers can instantly see who is actually present on-site.

---

## 📍 Core Mechanism – On-Site Attendance Detection

- When a participant enters a specified radius (**● meters**) around the event location using GPS, their status becomes **"Attendance Possible"**.

---

## 🚀 Main Features

### Organizer Sets Event Location and Time

- Organizers can set event details and choose a location via **Google Maps**.
- Users can see both the event location and their current position.

### Attendance Screen

- When a user enters the defined radius, they become **"Attendance Possible"**.
- Users can also send quick comments like:
  - “I’ll arrive in ~ minutes”.

### Attendance List Screen

- Organizers can view a **real-time list of attendees**.
- Comments submitted from the attendance screen are reflected here.

### One-Tap Arrival Notification + Status Comments

- When inside the GPS zone, an **“Arrived!”** button appears.
- Users can also select preset status messages (e.g., _“I’ll be there in 5 minutes”_) for quick communication.

### Manual Pin Adjustment

- Users can manually adjust the event location pin if the default location is inaccurate.

---

## 🧩 Planned Features (Coming Soon)

- **Auto Detection of Late/Early Departure**  
  Flags users who arrive late or leave early → integrated into attendance list.
- **Lock Screen Notifications (Background Mode)**  
  Push notifications to update status/arrival without unlocking the phone.  
  _(Planned after GPS stability is ensured.)_
- **Arrival Ranking + Stamp Card System**  
  Gamified incentives: track arrival order and award stamps to frequent/punctual attendees.

---

## ⏳ Optional Future Enhancements

(Postponed due to scope or overlap with full event management systems)

- **Arrival Notifications to Organizer**  
  Notify organizer in real time when a participant arrives.

- **Event Reminder Notifications**  
  Send reminders to participants before event start.

- **Photo Upload & Sharing**  
  Enable participants to upload and share photos after the event.

---

## 🔋 Battery Usage Considerations

🛑 **Problem:**  
Using `watchPositionAsync` or `startLocationUpdatesAsync` continuously leads to **excessive battery drain**, even in low-accuracy mode with high frequency.

✅ **Planned Solution:**

- Use **intermittent location checks** instead of constant tracking.
- Trigger GPS updates only when the screen is focused.
- Carefully evaluate optional background tracking before implementation.

# Organize vs History — quick spec

## Concepts

- `guest_id`: device-local anonymous ID. DEV ROLE (Organizer/Attendee) flips UI/permissions only; it does not change `guest_id`.
- Different devices/contexts (web vs. Android, incognito, cleared app data) mean different `guest_id`s.

---

## Organize tab

### Organizer

- Create/Edit events.
- View group schedule: Past / Active / Upcoming.
- Open Detail and Live (Organizer).
- Maps: web uses embedded preview; mobile opens Google Maps.
- Data ties: new events stamped with `created_by = this device's guest_id`. Listing itself does not require attendance.

### Attendee

- Browse-only: Past / Active / Upcoming, open Detail. No Create, no Live.
- Maps: same preview/launch behavior.
- Data ties: listing does not depend on your `guest_id`.

---

## History tab

### Organizer

- Shows events **created on this device** (`created_by == guest_id`) **plus** events **checked in by this device** (`attendance.user_id == guest_id`).
- Buckets: ACTIVE / UPCOMING / PAST (up to 20). Map preview/launch available.
- Pull-to-refresh, empty states, error banner.

### Attendee

- Shows **only** events **checked in by this device** (`attendance.user_id == guest_id`).
- Same buckets/UX as above; organizer-only actions are hidden.

> History is the device's personal log. If you did not check in (or RSVP in future), it will not appear here even if it exists in Organize.

---

## `guest_id` behavior

- Same device: checking in as Organizer writes to the same `guest_id`; switching to Attendee still shows that check-in in History.
- Different devices: different `guest_id`s, independent histories.
- Verify each `guest_id` in Profile during tests.

---

## Why keep both?

- **Organize**: "What is on the group schedule?"
- **History**: "What did I (this device) attend or create?"

---

## Strategy to differentiate History from Organize

- **Copy**: "History of this device's check-ins (and creations if Organizer)."
- **Actions**: add note, export (CSV/PDF), share proof, quick re-check-in/comment.
- **Signals**: check-in timestamp, GPS accuracy (±m), streaks/counters.
- **Filters**: Created vs Checked-in, group, date range (Today / 7d / 30d).
- **Future**: with login, migrate `guest_id -> user_id` for multi-device history; optionally include RSVP/bookmarks so upcoming items appear before check-in.
