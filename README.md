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
