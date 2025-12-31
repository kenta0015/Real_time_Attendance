# Validation notes (quick reviewer verification)

This page explains how GeoAttend was validated in realistic GPS/geofence scenarios.

> Goal: let a reviewer reproduce the core flow in ~10 minutes and understand what was tested.

---

## Quick verification (10 minutes)

### What you need

- Android device (recommended)
- Location enabled + “Precise location”
- Two accounts (organizer + attendee) OR two devices

### Steps

1. Sign in as Organizer
2. Create a Group
3. Create an Event (set geofence radius + time window)
4. Open “Show QR” for the event
5. Sign in as Attendee
6. Join the event (invite link or QR)
7. Attempt check-in:
   - Inside geofence → should succeed
   - Outside geofence → should fail (expected)
8. Organizer checks roster/history screen updates

---

## What was tested (high level)

- QR check-in **fallback path** (used when GPS accuracy is insufficient)
- GPS acquisition + accuracy handling
- Geofence inclusion checks (inside/outside boundary)
- Time window & grace rules (on-time/late/left-early classification)
- Attendance history correctness (organizer + attendee views)

---

## Pilot metrics (evidence)

A pilot checklist exists in:

- [docs/validation_metrics.xlsx](docs/validation_metrics.xlsx]) (exported from the original Numbers sheet)

The backend also provides validation-friendly views:

- `v_pilot_metrics` (summary metrics per event)
- `v_pilot_ranks` (ranked arrivals)
- `attendance_counts` (method breakdown)

---

## Notes / limitations

- GPS accuracy varies by device and environment.
- Dense urban areas can produce higher error rates.
- This is designed for clubs/meetups, not legal-grade compliance.
- QR is a fallback path used when GPS accuracy is insufficient; this run focused on GPS geofence gate reliability.
