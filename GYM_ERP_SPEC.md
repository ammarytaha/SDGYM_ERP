# Saad Gym ERP — Build Spec

## 1. Overview

Gym management system for Saad Gym. Handles members, membership billing, check-in/attendance, and WhatsApp notifications. No formal invoicing/accounting in MVP. Single location, no hardware access control (QR-based check-in instead of turnstiles/RFID).

## 2. Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Frontend:** React (separate app, consumes Express REST API)
- **Notifications:** WhatsApp Business API (ported from Loop's notification layer)
- **Auth:** JWT, role-based (owner, front_desk, trainer)

## 3. MVP Scope

In scope:
- Members (CRUD, profiles)
- Membership plans & subscriptions
- Payment tracking (manual/cash entry to start, no payment gateway yet)
- Check-in/attendance via QR code
- WhatsApp notifications (renewal reminders, check-in confirmation, payment overdue)

Out of scope for MVP (build later):
- Class scheduling & bookings
- Staff payroll/commission
- Reporting dashboard (beyond basic counts)
- POS/inventory
- Payment gateway integration (Paymob/Fawry)

## 4. Database Schema

### `users`
Staff/admin accounts (not members).
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | varchar | |
| email | varchar unique | |
| password_hash | varchar | |
| role | enum('owner','front_desk','trainer') | |
| created_at | timestamp | |

### `members`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| full_name | varchar | |
| phone | varchar unique | used for WhatsApp + QR lookup |
| email | varchar nullable | |
| photo_url | varchar nullable | |
| joined_at | date | |
| status | enum('active','frozen','expired','cancelled') | |
| qr_code_token | varchar unique | generated on signup, encoded in QR |
| created_at | timestamp | |

### `membership_plans`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | varchar | e.g. "Monthly", "Quarterly", "Annual" |
| duration_days | integer | |
| price | numeric | |
| active | boolean | can be retired without deleting |

### `subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| member_id | FK members | |
| plan_id | FK membership_plans | |
| start_date | date | |
| end_date | date | |
| status | enum('active','frozen','expired','cancelled') | |
| frozen_from | date nullable | pause support |
| frozen_until | date nullable | |
| created_at | timestamp | |

### `payments`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| member_id | FK members | |
| subscription_id | FK subscriptions | |
| amount | numeric | |
| method | enum('cash','card_manual','other') | no gateway in MVP |
| paid_at | timestamp | |
| notes | text nullable | |

### `checkins`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| member_id | FK members | |
| checked_in_at | timestamp | |
| method | enum('qr','manual') | manual = front desk override |

### `notifications_log`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| member_id | FK members | |
| type | enum('renewal_reminder','checkin_confirmation','payment_overdue','welcome') | |
| sent_at | timestamp | |
| status | enum('sent','failed') | |
| payload | jsonb nullable | message content/template used |

## 5. Core Flows

**QR check-in:**
1. Member scans QR (or front desk scans member's card/phone) at kiosk/tablet
2. Frontend hits `POST /api/checkins` with `qr_code_token`
3. Backend resolves member, checks `subscriptions.status`
4. If active → log checkin, send WhatsApp check-in confirmation
5. If expired/frozen → log attempt, show alert on front desk screen, do NOT send confirmation, prompt front desk to handle renewal

**Renewal reminder (scheduled job):**
1. Daily cron checks subscriptions with `end_date` within next 3 days
2. Sends WhatsApp renewal reminder per member
3. Logs to `notifications_log`

**New subscription:**
1. Front desk creates member (if new) → creates subscription → records payment
2. Backend sends WhatsApp welcome message on first subscription

## 6. API Routes (Express)

```
Auth
POST   /api/auth/login
POST   /api/auth/logout

Members
GET    /api/members
GET    /api/members/:id
POST   /api/members
PATCH  /api/members/:id
GET    /api/members/:id/qr        -> returns QR image/token

Membership Plans
GET    /api/plans
POST   /api/plans
PATCH  /api/plans/:id

Subscriptions
GET    /api/members/:id/subscriptions
POST   /api/subscriptions
PATCH  /api/subscriptions/:id      -> freeze/unfreeze/cancel

Payments
GET    /api/members/:id/payments
POST   /api/payments

Checkins
POST   /api/checkins
GET    /api/checkins?date=&member_id=

Notifications
GET    /api/notifications/log?member_id=
```

All routes except `/api/auth/login` require JWT. Role restrictions: `front_desk` cannot access plan management or payment amount edits after creation; `trainer` is read-only on members/checkins for MVP.

## 7. React Frontend Screens

All screens: Arabic, `dir="rtl"`, consistent typography/spacing. Mobile-responsive (front desk staff may use a tablet).


1. **Login** — role-based redirect
2. **Dashboard** — today's checkins count, active members, expiring this week (simple counts, not full reporting)
3. **Members list** — search/filter by status, add new member
4. **Member profile** — subscription history, payments, checkin history, freeze/cancel actions
5. **Check-in kiosk view** — simplified full-screen view for front desk tablet, QR scan input, shows member name/photo/status on scan
6. **New subscription / renew** — plan picker, payment entry
7. **Notification log** — per-member, for front desk to see what's been sent

## 8. WhatsApp Integration

**Provider: Meta Cloud API** (direct, official, no middleman markup).

**Staged rollout — business verification (tax ID, incorporation docs, utility bill)
is NOT needed to start building.** That's only required later to lift the 250
conversations/24hr cap before onboarding real members at volume. Development uses
Meta's free sandbox number in the meantime.

Requirements before Phase 5 (available now, no paperwork needed):
- Meta Developer account + Meta app with the WhatsApp product added → gives a free
  sandbox phone number + WABA ID
- Phone Number ID + permanent access token (via a System User, stored in `.env`,
  never committed)
- Message templates submitted for Meta approval EARLY (in parallel with Phase 0-2,
  not at Phase 5): `welcome`, `checkin_confirmation`, `renewal_reminder`,
  `payment_overdue`. This approval is separate from business verification and
  doesn't require it. Approval can take 24+ hours.

Before going live with real members (defer until then):
- Full Meta business verification to lift the sandbox conversation cap and switch
  to the real business phone number

Build:
- Service module structured the same way as Loop's notification layer (same pattern, adapted for Meta Cloud API's REST endpoint instead of whichever provider Loop settled on)
- Triggered from: checkin controller, subscription creation, daily cron job (renewal reminders)
- Log every send attempt (success or failure) to `notifications_log`, including Meta's response status

## 9. Build Phases (for Claude Code)

- **Phase 0:** Project scaffold — Express app structure, Postgres connection, migrations setup, JWT auth, `CLAUDE.md` with conventions
- **Phase 1:** Members module — schema, CRUD API, React members list + profile screens
- **Phase 2:** Membership plans + subscriptions — CRUD API, freeze/cancel logic, React screens
- **Phase 3:** Payments — manual payment entry, linked to subscriptions
- **Phase 4:** Check-in — QR token generation, checkin API, kiosk screen, status validation on scan
- **Phase 5:** WhatsApp notifications — port Loop's service, wire up welcome/checkin/renewal/overdue triggers, daily cron for renewal reminders
- **Phase 6:** Dashboard — basic counts screen

Each phase: implement against this spec section, seed test data, run a smoke test
demonstrating the new functionality (see CLAUDE.md Testing section), and get review
before moving to the next phase. Do not let Claude Code implement multiple phases
unsupervised in one pass.

## 10. Deferred (post-MVP)

- Class scheduling & bookings
- Staff shifts/payroll
- Payment gateway (Paymob/Fawry) instead of manual entry
- Full reporting/analytics dashboard
- POS/inventory for gym shop
- Access control hardware (turnstile/RFID) instead of QR
