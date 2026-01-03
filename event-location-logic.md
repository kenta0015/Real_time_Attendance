# Location logic (Organize → Create Event) — Current vs New Plan

Last updated: 2026-01-03
Scope: `app/(tabs)/organize/index.tsx` (address search → candidate list → apply to Venue)

---

## Goal

Replace manual lat/lng entry with:

1. User types an address/place query
2. User taps **Search**
3. App shows a short candidate list (prefer **"place-like name + address"**)
4. User taps a candidate → sets:
   - `lat`, `lng`
   - `locationName` (venue display name)

Constraints:

- Prefer free / no paid API for now
- Bias results toward Melbourne area (changeable later)
- Keep Search-button UX (no autocomplete for now)
- Future option: map picker (drop a pin) as fallback/improvement

---

## Current implementation (what exists today)

### UI / State

- `addressQuery` (text input)
- `searching` (boolean)
- `searchError` (string | null)
- `placeCandidates` (array of candidate objects shown in list)
- When user selects a candidate:
  - `lat` / `lng` are set as strings
  - `locationName` is set to `candidate.title || candidate.subtitle`

### Search pipeline (2-stage)

When Search is pressed:

1. **Forward geocoding**

   - `Location.geocodeAsync(query)` returns multiple coordinate candidates
   - Results are sliced to max N (e.g., 10)

2. **Reverse geocoding per coordinate**

   - For each coordinate candidate:
     - `Location.reverseGeocodeAsync({ latitude, longitude })`
   - The returned "address object" is used to build labels:
     - `title` and `subtitle` are derived mainly from address parts
       - `streetNumber + street` → street line
       - `city/region/postalCode` → locality line
       - `addr.name` is used only if present and matches conditions
     - Fallback: if strings missing, subtitle can include coordinates

3. **Deduplication**
   - Candidates are deduped by a key built from:
     - `title || subtitle || lat(6dp) || lng(6dp)`
   - This can cause "Candidates: 1" outcomes when many items collapse into one.

### Observed issues

- "Facility name" often disappears; title becomes a street address.
- Candidate count often collapses to 1 due to label-based dedupe.
- Reverse geocode sometimes injects odd fragments into subtitle.
- Lat/lng values vary slightly vs map apps (expected from geocoder precision).

---

## New plan (free-first, quality-focused, Melbourne-biased)

Key idea:

- Expo Location alone cannot reliably produce true POI names like paid Places APIs.
- Instead, we improve the _perceived_ quality by:
  - using forward geocode as the primary result source,
  - applying a Melbourne bias + sorting,
  - building "place-like" titles using the user's query when appropriate,
  - using reverse geocode only to _enrich_ the subtitle (address), not to decide the title,
  - changing dedupe to coordinate-proximity (not string labels).

### Definition: "Facility name + address"

- **Title** (top line):
  - Prefer "POI-like" name:
    - For place-style queries (e.g., "Melbourne Central", "RMIT"), keep **Title = query** (trimmed)
  - For address-style queries (e.g., "350 bourke street"), use **Title = street line**
- **Subtitle** (bottom line):
  - A compact address line:
    - `streetNumber street, suburb, VIC postcode` (best case)
    - or `suburb, VIC` (fallback)

### Melbourne bias (configurable)

- Center: Melbourne CBD (approx)
  - `CENTER_LAT = -37.8136`
  - `CENTER_LNG = 144.9631`
- Radius: `BIAS_RADIUS_KM = 60`
- Candidates outside the radius are either:
  - removed, or
  - kept but ranked lower (preferred approach: rank lower to avoid "0 results" too often)

### Candidate list specification

- Max displayed candidates: `MAX_CANDIDATES = 10`
- Sorting:
  1. distance from Melbourne center ascending
  2. tie-breaker: address completeness score (has street+postcode > has suburb only)
- Deduplication:
  - coordinate-based proximity clustering (recommended: 100m threshold)
  - do NOT dedupe by `title/subtitle` strings

### Search flow (Search button)

On Search press:

1. Clear `searchError`
2. Validate `addressQuery`
   - minimum length: 2 chars
3. Set `searching=true`
4. Forward geocode:
   - `Location.geocodeAsync(addressQuery)`
5. Map forward results into internal candidates:
   - Each candidate has:
     - `lat`, `lng`
     - `title` (query-based or street-based)
     - `subtitle` (enriched address, best-effort)
6. (Optional enrichment) Reverse geocode only for address subtitle:
   - run reverse geocode for top N (e.g., top 10) _after sorting by distance_
   - do not overwrite title unless title is empty
7. Dedupe by proximity (100m)
8. Slice to max 10
9. Set `searching=false`

### Selection behavior (unchanged)

When user taps a candidate:

- Set:
  - `lat = String(candidate.lat)`
  - `lng = String(candidate.lng)`
  - `locationName = candidate.title` (or fallback to subtitle)

### Validation rules (create-time)

- Internal coordinate validation:
  - `lat` must be within [-90, 90]
  - `lng` must be within [-180, 180]
- If search returns 0 results:
  - Show error + guidance:
    - “Try adding suburb name, street name, or a more specific place name.”

---

## Future improvements (optional)

1. Map picker (pin drop)
   - Lets user confirm location visually even if text search is imperfect.
2. Optional autocomplete
   - Consider only after search quality is stable (adds complexity: rate limiting, debouncing, UI).
3. Paid API option
   - Google Places provides best POI naming and formatted addresses
   - If adopted, API key should be stored server-side (API server) and proxied.

---

## Notes / Non-goals

- Perfect POI naming is not guaranteed with free geocoding.
- The "query-as-title" strategy is intentional to keep UX "place-like"
  even if the underlying geocoder returns mostly address-level results.
