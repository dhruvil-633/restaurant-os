<div align="center">

# 🍽️ RestaurantOS by Rajvee

**The operating system for modern restaurants.**

Floor, kitchen, inventory and analytics in one place — so the people running service are looking at the room, not at spreadsheets.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)
![Node](https://img.shields.io/badge/Node-20+-339933)
![Postgres](https://img.shields.io/badge/Postgres-Supabase-3ecf8e)

</div>

---

## Contents

- [What this is](#what-this-is)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Demo accounts](#demo-accounts)
- [Deployment](#deployment)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)
- [License](#license)

---

## What this is

RestaurantOS is back-office software for people who **run** a restaurant — not a
food-ordering site for guests. It covers the working day end to end: seating a
table, firing a ticket to the kitchen, watching it turn red when it runs late,
settling the bill, deducting the ingredients that were used, and then telling the
owner where the money and the minutes actually went.

Every screen is built against real, seeded data: 60 days of weighted order
history, live tickets on the pass, stock movements and guest reviews.

---

## Features

### Operations

| Area | What it does |
|---|---|
| **Floor plan** | Interactive table grid by section, live status, seated timers, waiter assignment, and a Smart Wait Time estimate for walk-ins |
| **Orders** | Dine-in, takeaway and delivery with a guarded status lifecycle, per-item status, discounts, split payment methods and printable bills |
| **Kitchen Display** | Three-lane board (queued / cooking / ready), per-ticket countdown against the dish's own prep time, priority colours, and one-tap advance |
| **Reservations** | Overlap-checked bookings, arrival tracking, no-show marking, and today's board with expected covers |
| **Menu** | Categories, dishes, pricing, margins, images, recipes, and a sold-out toggle the kitchen can hit mid-service |

### Management

| Area | What it does |
|---|---|
| **Inventory** | Ingredients, suppliers, purchase orders, receiving, waste logging, low-stock and expiry alerts, and an append-only stock ledger |
| **Guests** | Visit history, loyalty points, birthdays, feedback, and the Customer Memory profile |
| **Team** | Staff accounts with six roles, HR records, attendance, shifts, and a blended performance score |
| **Reports** | Revenue, orders, guests, inventory and menu sales — on screen, as CSV, or as a formatted PDF |

### The eight signature features

1. **Restaurant Replay** — every meaningful event is appended to a log, then played back on a scrubbable timeline so you can watch a service unfold.
2. **Kitchen Heatmap** — compares each dish's actual cook time against the time the menu promises, and ranks bottlenecks by *total* minutes lost, not worst single ticket.
3. **Smart Wait Time** — estimates a walk-in's wait from free tables, how far into their meal the seated tables are, and how backed up the kitchen is.
4. **Waste Analytics** — what was thrown out, what it cost, why, and what that projects to per month.
5. **Restaurant Health Score** — one 0–100 number across five weighted pillars (revenue growth, guest ratings, kitchen speed, inventory health, waste control), so a strong area cannot mask a weak one.
6. **Peak Hour Analytics** — a day-by-hour revenue heatmap for staffing decisions.
7. **Employee Performance** — service speed, volume, revenue, guest ratings and attendance combined into one comparable score.
8. **Customer Memory** — what a returning guest usually orders, their average bill, how often they visit and when their birthday is.

### Platform

Real-time updates over Socket.io · role-based access across six roles · global
search · toast + persisted notifications · light and dark themes · fully
responsive · JWT auth with refresh-token rotation and replay detection.

---

## Tech stack

**Frontend** — React 19 · Vite 6 · TypeScript (strict) · Tailwind CSS v4 · Radix UI primitives · TanStack Query · Zustand · React Hook Form + Zod · Recharts · Framer Motion · Socket.io client

**Backend** — Node 20 · Express · TypeScript (strict) · Drizzle ORM · PostgreSQL (Supabase) · JWT · bcrypt · Socket.io · Multer · Nodemailer · Helmet · Zod

**Infrastructure** — Vercel (frontend) · Render (API) · Supabase (Postgres + Storage) · Cloudinary (optional images)

> **A note on the stack.** The brief specified MongoDB; the project uses
> **Supabase Postgres with Drizzle** instead, at the request of the person
> deploying it. This turned out to suit the domain better — orders → items →
> recipe → ingredient is a deeply relational chain, and the analytics features
> lean on joins and window functions that would be awkward in an aggregation
> pipeline. Everything else in the brief (Express REST API, JWT + refresh
> tokens, RBAC, Socket.io, the middleware stack) is implemented as specified.

---

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  Vercel          │  HTTPS  │  Render          │  SSL    │  Supabase        │
│                  │────────▶│                  │────────▶│                  │
│  React 19 SPA    │◀────────│  Express + TS    │◀────────│  PostgreSQL      │
│  Vite build      │  WSS    │  Socket.io       │         │  Storage bucket  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

**Request path** — `route → validate (Zod) → authenticate → authorize (RBAC) → controller → service → Drizzle → Postgres`, with every error funnelled through one global handler that translates Postgres error classes (unique violation, FK violation, …) into meaningful 4xx replies.

**Real-time** — the socket handshake carries the same access token the REST API uses. On connect, a client joins rooms scoped to its user, its role, and its function (`kitchen`, `floor`, `management`), so a waiter never receives management analytics events. Server events map to precise React Query cache invalidations, which means any open screen showing affected data refreshes itself without its own subscription.

**Adapters** — file storage resolves at boot in the order Supabase Storage → Cloudinary → local disk; email resolves SMTP → console logger. With no credentials at all, the app still runs and every flow stays testable.

---

## Getting started

### Prerequisites

- **Node.js 20+** and npm
- A **Supabase** project (the free tier is enough) — or any PostgreSQL 14+ database

### 1. Clone and install

```bash
git clone <your-repo-url> restaurant-os
```

```bash
cd restaurant-os/backend && npm install
```

```bash
cd ../frontend && npm install
```

### 2. Create the database

In your Supabase project, open **Project Settings → Database → Connection string → URI** and copy it. Use the **Session pooler** (port 5432) for local work.

### 3. Configure the backend

```bash
cd backend && cp .env.example .env
```

Fill in `DATABASE_URL`, then generate the two JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Create the tables and seed demo data

```bash
cd backend && npm run db:push
```

```bash
cd backend && npm run db:seed
```

The seed prints a summary and the demo credentials when it finishes.

### 5. Configure the frontend

```bash
cd frontend && cp .env.example .env
```

The default `VITE_API_URL=http://localhost:5000` is correct for local development.

### 6. Run both

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

The app is at **http://localhost:5173**, the API at **http://localhost:5000**.

### Useful scripts

| Command | Location | What it does |
|---|---|---|
| `npm run dev` | either | Start with hot reload |
| `npm run build` | either | Production build |
| `npm run typecheck` | either | Type-check without emitting |
| `npm run db:push` | backend | Sync the schema to the database |
| `npm run db:seed` | backend | Wipe and reseed demo data |
| `npm run db:studio` | backend | Open Drizzle Studio |

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Notes |
|---|:---:|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection string |
| `JWT_ACCESS_SECRET` | ✅ | — | ≥ 24 characters |
| `JWT_REFRESH_SECRET` | ✅ | — | Must differ from the access secret |
| `NODE_ENV` | | `development` | |
| `PORT` | | `5000` | |
| `JWT_ACCESS_EXPIRES_IN` | | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | | `7d` | |
| `CORS_ORIGINS` | | `http://localhost:5173` | Comma-separated |
| `CLIENT_URL` | | `http://localhost:5173` | Used in password-reset emails |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | | — | Enables Supabase Storage |
| `CLOUDINARY_*` | | — | Fallback image host |
| `SMTP_*` | | — | Without these, email logs to the console |
| `RATE_LIMIT_*` | | 15 min / 500 req | Auth routes use a tighter limit |

The server validates all of this with Zod at boot and exits with a readable report if anything is wrong, rather than failing on the first request.

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
|---|:---:|---|
| `VITE_API_URL` | ✅ | API origin, no trailing slash, no `/api` |

---

## Demo accounts

After `npm run db:seed`, sign in with any of these. The password for **all** of them is `Password123`.

| Role | Email | Lands on |
|---|---|---|
| Owner | `owner@restaurantos.app` | Dashboard |
| Manager | `manager@restaurantos.app` | Dashboard |
| Cashier | `cashier@restaurantos.app` | Orders |
| Waiter | `waiter@restaurantos.app` | Floor |
| Chef | `chef@restaurantos.app` | Kitchen |
| Kitchen staff | `kitchen@restaurantos.app` | Kitchen |

The login screen has one-tap buttons for the first four. Sign in as different roles to see role-based access change what's in the sidebar and what the API will allow.

---

## Deployment

### Database — Supabase

1. Create a project (free tier).
2. Copy the connection URI. For Render, prefer the **Transaction pooler** (port 6543) — the API detects that port and disables prepared statements automatically.
3. From your machine, point `backend/.env` at the production database and run `npm run db:push`, then optionally `npm run db:seed`.

### API — Render

The repository ships a [`render.yaml`](render.yaml) blueprint.

1. **New → Blueprint** on Render, and select this repository.
2. Supply `DATABASE_URL`, `CORS_ORIGINS` and `CLIENT_URL` when prompted. The JWT secrets are generated for you.
3. Deploy. Health check is `GET /health`.

> **Free-tier note.** Render spins a free service down after 15 minutes idle, so the first request after a quiet spell takes ~50 seconds. The frontend handles this gracefully, but expect that pause on a cold demo.

### Frontend — Vercel

1. **Add New → Project**, select the repository, and set the **root directory** to `frontend`.
2. Add the environment variable `VITE_API_URL` = your Render URL (e.g. `https://restaurant-os-api.onrender.com`).
3. Deploy. [`vercel.json`](frontend/vercel.json) already handles SPA rewrites, asset caching and security headers.

### Finally

Go back to Render and set `CORS_ORIGINS` and `CLIENT_URL` to your Vercel domain, then redeploy. Preview deployments on `*.vercel.app` are allowed automatically.

---

## API reference

Base URL: `<API_URL>/api`. All responses share one envelope:

```json
{ "success": true, "message": "Success", "data": {}, "meta": {} }
```

Errors return `{ "success": false, "message": "...", "code": "...", "issues": [] }`.

Every route except `/auth/*` and `/health` requires `Authorization: Bearer <accessToken>`.

<details>
<summary><b>Authentication</b> — <code>/api/auth</code></summary>

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/register` | Public¹ | Creates the first owner account |
| `POST` | `/login` | Public | Returns user + access/refresh tokens |
| `POST` | `/refresh` | Public | Rotates the token pair |
| `POST` | `/logout` | Public | Revokes the presented refresh token |
| `POST` | `/forgot-password` | Public | Emails a reset link |
| `POST` | `/reset-password` | Public | Consumes the reset token |
| `GET` | `/me` | Any | Current profile |
| `PATCH` | `/me` | Any | Update name, phone, avatar |
| `POST` | `/change-password` | Any | Revokes every session |
| `POST` | `/logout-all` | Any | Signs out every device |

¹ Only while the users table is empty. Afterwards, staff accounts are created through `/api/users` — open self-registration into a restaurant's back office would be a security hole.

</details>

<details>
<summary><b>Orders &amp; kitchen</b> — <code>/api/orders</code>, <code>/api/kitchen</code></summary>

| Method | Path | Access |
|---|---|---|
| `GET` | `/orders` | Any · filters: `status`, `type`, `tableId`, `waiterId`, `search`, `from`, `to`, `page`, `limit` |
| `GET` | `/orders/:id` | Any |
| `GET` | `/orders/:id/bill` | Any |
| `POST` | `/orders` | Owner, Manager, Cashier, Waiter |
| `POST` | `/orders/:id/items` | Owner, Manager, Cashier, Waiter |
| `DELETE` | `/orders/:id/items/:itemId` | Owner, Manager, Cashier, Waiter |
| `PATCH` | `/orders/:id/status` | All roles (transition table enforces validity) |
| `PATCH` | `/orders/items/:itemId/status` | Owner, Manager, Chef, Kitchen staff |
| `PATCH` | `/orders/:id/chef` | Owner, Manager, Chef |
| `POST` | `/orders/:id/settle` | Owner, Manager, Cashier |
| `GET` | `/kitchen/queue` | Owner, Manager, Chef, Kitchen staff |

Status flow: `pending → cooking → ready → served → completed`, with `cancelled` reachable from any non-terminal state.

</details>

<details>
<summary><b>Floor, menu, reservations</b></summary>

| Method | Path | Access |
|---|---|---|
| `GET` | `/tables`, `/tables/sections`, `/tables/wait-time` | Any |
| `PATCH` | `/tables/:id/status`, `/tables/:id/waiter` | Owner, Manager, Cashier, Waiter |
| `POST` | `/tables`, `/tables/layout` | Owner, Manager |
| `PATCH`/`DELETE` | `/tables/:id` | Owner, Manager |
| `GET` | `/menu/categories`, `/menu/items`, `/menu/for-ordering` | Any |
| `POST`/`PATCH`/`DELETE` | `/menu/categories`, `/menu/items` | Owner, Manager |
| `PATCH` | `/menu/items/:id/availability` | Owner, Manager, Chef, Kitchen staff |
| `POST` | `/menu/items/:id/recipe` | Owner, Manager |
| `GET` | `/reservations`, `/reservations/today`, `/reservations/:id` | Any |
| `POST`/`PATCH` | `/reservations` | Owner, Manager, Cashier, Waiter |
| `DELETE` | `/reservations/:id` | Owner, Manager |

</details>

<details>
<summary><b>Guests, team, inventory</b></summary>

| Method | Path | Access |
|---|---|---|
| `GET` | `/customers`, `/customers/lookup`, `/customers/birthdays`, `/customers/feedback` | Floor roles |
| `GET` | `/customers/:id/memory` | Floor roles |
| `POST`/`PATCH` | `/customers` | Floor roles |
| `POST` | `/customers/:id/loyalty` | Owner, Manager, Cashier |
| `POST` | `/feedback` | Any |
| `GET`/`POST`/`PATCH`/`DELETE` | `/employees`, `/employees/attendance`, `/employees/shifts` | Owner, Manager |
| `GET` | `/employees/performance` | Owner, Manager |
| `GET` | `/users/assignable`, `/users/roles` | Any |
| `GET`/`POST`/`PATCH`/`DELETE` | `/users` | Owner, Manager |
| `GET` | `/inventory`, `/inventory/summary`, `/inventory/transactions`, `/inventory/suppliers`, `/inventory/purchases` | Any |
| `POST` | `/inventory/waste` | Owner, Manager, Chef, Kitchen staff |
| `POST`/`PATCH`/`DELETE` | `/inventory`, `/inventory/suppliers`, `/inventory/purchases` | Owner, Manager |

</details>

<details>
<summary><b>Dashboard, analytics, reports, platform</b></summary>

| Method | Path | Access |
|---|---|---|
| `GET` | `/dashboard/overview`, `/revenue-chart`, `/popular-dishes`, `/order-mix`, `/activity` | Any |
| `GET` | `/analytics/replay` | Owner, Manager |
| `GET` | `/analytics/kitchen-heatmap` | Owner, Manager |
| `GET` | `/analytics/waste` | Owner, Manager |
| `GET` | `/analytics/health-score` | Owner, Manager |
| `GET` | `/analytics/peak-hours` | Owner, Manager |
| `GET` | `/analytics/menu-performance` | Owner, Manager |
| `GET` | `/reports/{revenue,orders,customers,inventory}` | Owner, Manager |
| `GET` | `/reports/{...}/export` | Owner, Manager · returns CSV |
| `GET`/`POST` | `/notifications` | Any |
| `POST`/`DELETE` | `/uploads` | Any / Owner, Manager |
| `GET` | `/search?q=` | Any |
| `GET`/`PATCH` | `/settings` | Any / Owner, Manager |

</details>

### Socket events

| Event | Rooms |
|---|---|
| `order:created`, `order:updated`, `order:ready`, `order:completed`, `order:cancelled` | kitchen, floor |
| `order-item:updated` | kitchen, floor |
| `table:updated` | floor |
| `reservation:created`, `reservation:updated` | floor |
| `inventory:alert`, `inventory:updated` | management |
| `notification:new` | targeted user or role |
| `activity:logged` | management |

---

## Project structure

```
restaurant-os/
├── backend/
│   ├── src/
│   │   ├── config/        env validation, logger
│   │   ├── db/
│   │   │   ├── schema/    24 tables across 7 domain files
│   │   │   └── seed.ts    60 days of weighted demo data
│   │   ├── controllers/   request handling per domain
│   │   ├── services/      business logic, storage + mail adapters
│   │   ├── routes/        routing and per-route RBAC
│   │   ├── middlewares/   auth, validation, errors, rate limit, upload
│   │   ├── validators/    Zod schemas
│   │   ├── socket/        realtime gateway and event names
│   │   ├── emails/        HTML templates
│   │   └── utils/         errors, responses, JWT, CSV, serialisation
│   └── drizzle.config.ts
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ui/        design-system primitives
│       │   ├── layout/    sidebar, topbar
│       │   ├── charts/    shared Recharts theme
│       │   └── shared/    page header, stat card
│       ├── pages/         one file per screen
│       ├── layouts/       auth and dashboard shells
│       ├── routes/        lazy routes + guards
│       ├── services/      typed API client
│       ├── store/         Zustand (auth, UI)
│       ├── hooks/         socket, debounce, hotkeys, media query
│       ├── types/         API contract types
│       └── index.css      theme tokens, light + dark
│
├── render.yaml            API blueprint
└── README.md
```

---

## Design decisions

A few choices that are deliberate rather than accidental:

**Deleting never rewrites history.** Removing a dish that appears on past orders retires it from the menu instead of deleting the row; the same applies to tables, staff and ingredients with recorded movement. Historical bills always resolve their dish, table and server.

**Money is `NUMERIC` in the database, `number` at the API boundary.** Postgres returns `NUMERIC` as a string to preserve exact decimals. Rather than let a float creep into the schema, the conversion happens explicitly in serialisers, so the database stays exact and the frontend still gets real numbers for its charts.

**Refresh tokens are stored hashed and rotate on use.** Presenting a token that verifies but is no longer on file is treated as a replay, and every session for that user is revoked. The token travels both in an httpOnly cookie and in the response body, because browsers that block third-party cookies would otherwise silently break a Vercel → Render deployment.

**Order lifecycle timestamps are discrete columns.** Every analytics feature measures the gap between two specific transitions, so `cookingStartedAt`, `readyAt`, `servedAt` and `completedAt` are stored as their own columns rather than derived from a status log.

**Injection is prevented structurally, not by scrubbing.** Drizzle emits parameterised SQL and React escapes text nodes on render, so the sanitiser only strips prototype-pollution keys — blanket HTML stripping would corrupt a legitimate dish called "Fish & Chips".

**The backend compiles to CommonJS with relative imports.** `tsc` rewrites neither path aliases nor ESM file extensions, and both silently break `node dist/server.js` in production. This is the boring choice that deploys reliably.

---

## License

[MIT](LICENSE) © 2026 RestaurantOS
