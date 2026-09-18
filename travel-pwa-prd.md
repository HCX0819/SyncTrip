# Product Requirements Document (PRD)
## Travel Planner PWA — "SyncTrip"

**Status:** Draft v1.0
**Owner:** Heng
**Last updated:** 2026-09-18

---

## 1. Overview

A mobile-first Progressive Web App that turns group trip planning from scattered chat threads into a single collaborative space. Users discover places through visual/video content, save them to a trip, and the group converges on decisions through lightweight voting — inspired by yaaytravel's model, built lean on Next.js + Supabase + Vercel.

**Vision statement:** *"From inspiration to itinerary, without leaving the app."*

---

## 2. Problem Statement

Group trip planning today happens across WhatsApp/WeChat threads, screenshots, spreadsheets, and booking sites — with no single source of truth. Decisions stall because:
- Saved ideas (a restaurant from TikTok, a hotel from Instagram) get lost in chat scroll
- No lightweight way for a group to agree on options without an argument
- No shared, visual view of what the trip actually looks like

**Target users:**
- Primary: friend groups (4–8 people) planning a leisure trip together
- Secondary (future): solo travelers building a personal trip moodboard

---

## 3. Goals & Success Metrics

| Goal | Metric | MVP Target |
|---|---|---|
| Reduce planning friction | Time from trip creation → itinerary locked | < 7 days avg |
| Drive collaborative engagement | % of trip members who vote at least once | > 70% |
| Retain users across trips | Users who create a 2nd trip within 90 days | > 25% |
| Mobile usability | Lighthouse PWA + mobile performance score | > 90 |

---

## 4. Scope

### 4.1 MVP (Phase 1)
- Auth (email magic link + Google OAuth via Supabase)
- Create/join a trip (invite via link)
- Save places/content to a trip (manual entry + link paste, no video parsing yet)
- Trip moodboard (visual grid of saved items)
- Map view of a trip's saved places (pinned locations, tap-to-preview card)
- Simple voting ("yaay" / "naay") per saved item
- Basic itinerary view (day-by-day list, manually ordered)
- PWA installability (manifest, service worker, offline shell)

### 4.2 Phase 1.5 (cheap win before full AI parsing)
- Link paste auto-fills title + thumbnail via Instagram/TikTok public oEmbed endpoints (no auth, no scraping) — location still manually pinned on map

### 4.3 Phase 2 (Post-MVP)
- Video/link auto-parsing (extract location from caption/video via AI — separate from oEmbed above)
- Real-time presence ("who's viewing this trip now") — first actual use of Supabase Realtime; MVP uses revalidation/polling instead to avoid concurrent-connection cost
- Push notifications (new vote, new save, itinerary change)
- Budget split / expense tracking per trip
- Public trip templates / discovery feed

### 4.4 Explicitly out of scope for MVP
- In-app booking/payment (flights, hotels)
- AI-generated itinerary suggestions
- Native iOS/Android app (PWA only)

---

## 5. Feature Requirements (MVP)

### 5.1 Authentication
- **US-01**: As a user, I can sign up/log in via email magic link or Google, so I don't need a password.
- **US-02**: As a user, my session persists across app restarts (PWA installed).

### 5.2 Trips
- **US-03**: As a user, I can create a trip with a name, destination, and date range.
- **US-04**: As a trip creator, I can generate an invite link that adds anyone who opens it as a trip member.
- **US-05**: As a member, I can see all trips I belong to on a home dashboard.

### 5.3 Saving places
- **US-06**: As a member, I can add a place to a trip via a form (name, photo, note, category: stay/eat/do).
- **US-07**: As a member, I can paste a link (Instagram/TikTok/Google Maps) and the app stores it as a card with a manual title/photo fallback (auto-parsing deferred to Phase 2).
- **US-08**: As a member, I can view all saved places in a visual grid (moodboard), filterable by category.

### 5.4 Map view
- **US-08a**: As a member, when I add a place I can search an address/place name and it's geocoded to lat/lng (via map provider's places search, not AI — that's Phase 2).
- **US-08b**: As a member, I can view all saved places for a trip as pins on a single map, color-coded by category (stay/eat/do).
- **US-08c**: As a member, tapping a pin opens a preview card (photo, title, vote tally) with a link to the full place detail.

### 5.5 Voting
- **US-09**: As a member, I can vote yaay/naay on any saved place.
- **US-10**: As a member, I can see vote tally and who voted what.
- **US-11**: Items with majority "yaay" are visually flagged as "trip favorites."

### 5.6 Itinerary
- **US-12**: As a member, I can drag a saved place into a specific day of the trip.
- **US-13**: As a member, I can view the itinerary as a day-by-day list.

### 5.7 PWA requirements
- **US-14**: The app is installable to home screen on iOS and Android.
- **US-15**: Core screens (dashboard, trip view) render from cache when offline, with a clear "offline" indicator for stale data.

---

## 6. Technical Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind CSS, design tokens per §8 |
| Auth | Supabase Auth (magic link + Google OAuth) |
| Database | Supabase Postgres, Row-Level Security scoped per trip |
| Storage | Supabase Storage (place photos, avatars) |
| Realtime | Supabase Realtime (Phase 2 only — MVP uses revalidation/polling to avoid connection cost) |
| Maps | Mapbox GL JS (custom dark/B&W map style, place search/geocoding via Mapbox Search API) |
| Hosting | Vercel (Edge Network, ISR for public trip pages if added later) |
| PWA | `@ducanh2912/next-pwa` (service worker + manifest) |

**Why this stack:** every backend need (auth, DB, storage, realtime) is covered by Supabase alone — no extra services, minimal ops overhead, consistent with a lean-architecture approach.

---

## 7. Data Model (Supabase / Postgres)

```
trips
  id (uuid, pk)
  name (text)
  destination (text)
  start_date, end_date (date)
  created_by (uuid, fk -> auth.users)
  created_at (timestamptz)

trip_members
  id (uuid, pk)
  trip_id (uuid, fk -> trips)
  user_id (uuid, fk -> auth.users)
  role (enum: owner, member)
  joined_at (timestamptz)

saved_places
  id (uuid, pk)
  trip_id (uuid, fk -> trips)
  added_by (uuid, fk -> auth.users)
  title (text)
  category (enum: stay, eat, do, other)
  source_url (text, nullable)
  photo_url (text, nullable)
  note (text, nullable)
  latitude (numeric, nullable)
  longitude (numeric, nullable)
  address (text, nullable)
  created_at (timestamptz)

votes
  id (uuid, pk)
  place_id (uuid, fk -> saved_places)
  user_id (uuid, fk -> auth.users)
  value (enum: yaay, naay)
  UNIQUE (place_id, user_id)

itinerary_items
  id (uuid, pk)
  trip_id (uuid, fk -> trips)
  place_id (uuid, fk -> saved_places)
  day_index (int)
  sort_order (int)
```

**RLS policy pattern:** every table (except `trips` insert) checks `auth.uid()` against `trip_members` for the relevant `trip_id` — no user can read/write data for a trip they don't belong to.

---

## 8. UI/UX Guidelines — Luxury B&W

- **Palette:** near-black `#0A0A0A` backgrounds (not pure black), warm off-white `#F5F3EF` text/surfaces, single accent (thin gold-foil line or warm ivory) reserved for active states and primary CTAs only
- **Typography:** serif/display font for headings (e.g. Fraunces), clean grotesk (Inter) for body — contrast drives the "luxury" feel more than color does
- **Layout:** bottom tab navigation (thumb zone), generous whitespace, full-bleed photography with gradient scrim overlays for text
- **Motion:** subtle, restrained transitions (200–300ms ease) — no bouncy/playful animation, it undercuts the luxury tone

---

## 9. Non-Functional Requirements

- **Performance:** Lighthouse mobile score > 90; LCP < 2.5s on 4G
- **Security:** all data access via Supabase RLS; no service-role key exposed client-side
- **Offline:** app shell + last-viewed trip cached via service worker
- **Accessibility:** WCAG AA contrast minimums even within the B&W palette (near-black/off-white passes; verify accent-on-background combinations)
- **i18n:** English + Chinese UI strings from day one (structure via `next-intl` or similar)

---

## 10. Milestones

| Phase | Scope | Target |
|---|---|---|
| M1 | Auth + trip CRUD + invite flow | Week 1–2 |
| M2 | Saved places + moodboard grid | Week 3–4 |
| M3 | Voting system | Week 5 |
| M4 | Itinerary (drag-to-day) | Week 6 |
| M5 | PWA polish (manifest, offline, install prompts) | Week 7 |
| M6 | QA, beta with 1–2 real trip groups | Week 8 |

---

## 11. Open Questions / Risks

- **Link auto-parsing (Phase 2):** confirmed risk — TikTok/Instagram don't offer stable public APIs for full location extraction. Mitigated short-term by oEmbed (title/thumbnail only, see §4.2); full AI-based location parsing remains Phase 2 and may take longer than the milestone plan assumes.
- **Realtime cost at scale:** mitigated for MVP by not using Supabase Realtime at all (revalidation/polling instead) — revisit connection limits once presence/live-vote features are actually built in Phase 2.
- **Map provider cost:** Mapbox's free tier covers early usage, but geocoding/search API calls should be monitored as trip/place volume grows — consider caching geocode results by place name.
- **iOS PWA limitations:** no native push notifications on iOS PWAs until iOS 16.4+, and install flow is manual (no native prompt) — Phase 2 push feature needs a fallback UX for iOS users.
