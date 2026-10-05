Open Source · Fintech · React Native

# Settlr — Bill Splitting that Actually Settles.

A full-stack mobile application that connects to your bank via open banking, detects payments in real-time, and routes reimbursements directly to the payer — without anyone opening a second app.

React Native Node.js PostgreSQL Stripe Connect TrueLayer Redis + Bull Expo Socket.IO

## 🎯 The Problem

### Splitwise today

Splitwise tracks debt accurately. But it ends at the notification. The actual money still needs a manual bank transfer — a separate app, a separate step, a separate reminder. Most people never complete it.

### Settlr's answer

Settlr closes the loop. It detects the payment from your bank, sends a one-tap payment request, and moves the money via Stripe — all without leaving the app. The ledger updates itself when it's done.

## ⚡ How It Works

01

**Bank payment detected**

TrueLayer open banking polls the payer's account. When a new payment appears, Settlr extracts the merchant name and amount automatically — no manual entry required.

02

**Split request sent**

The payer assigns shares to friends. Each payee receives a push notification with inline action buttons — **Pay Now** or **Pay Later** — without opening the app.

03

**Payment collected via Stripe**

Pay Now opens a Stripe payment sheet. Money moves via Stripe Connect directly to the payer's account. The split is marked settled in real-time via webhook.

04

**Smart fallback for non-responders**

No response after an hour? The split auto-converts to a tracked debt. Redis-backed Bull queues fire reminders on Day 1, 2, 3, 5, 7, 10, and 14 — and cancel automatically once settled.

05

**Dispute resolution**

A payee can decline with a reason. Both parties see the dispute in-app; the payer can mark it resolved once sorted. A full paper trail is preserved.

## 🛠 Architecture & Tech Stack

Mobile

React Native + Expo

Native iOS build via `expo run:ios`. Push notification action buttons, Stripe payment sheet, real-time WebSocket updates.

Backend API

Node.js + Express

REST API with JWT auth, middleware error handling, and Socket.IO for real-time split request delivery.

Database

PostgreSQL

Relational model with transactions, splits, debts, and disputes. ACID-compliant with row-level transaction isolation for financial integrity.

Job Queue

Redis + Bull

Persistent background jobs for debt reminders and nudges. All jobs are self-cancelling — they check DB state before firing.

Payments

Stripe Connect

PaymentIntents with `transfer_data` route funds directly to the payer's Connect account. Webhook verifies settlement with signature validation.

Open Banking

TrueLayer

OAuth 2.0 bank connection. Detects transactions from the payer's account. Auto-refresh token chain with graceful disconnect on expiry.

Notifications

Expo Push + APNs

Actionable push notifications with `SPLIT_REQUEST` and `PAYMENT_SPLIT` categories. Inline Pay Now / Pay Later buttons without opening the app.

Auth

JWT + bcrypt

Stateless token auth. Tokens are stored in AsyncStorage and cleared only on legitimate auth failures — not on upstream 401s from external APIs.

## ✦ Key Features

🏦

**Auto-detect payments from your bank** TrueLayer open banking polls your account and pre-fills split amounts from real transaction data. No receipt photos, no manual entry.

💸

**One-tap settlement via Stripe** Pay Now opens a native Stripe payment sheet. Money routes directly to the payer's account via Stripe Connect. Webhook confirms settlement.

🔔

**Actionable push notifications** Pay Now or Pay Later directly from the notification. No app open required. Categories registered via Expo Notifications on native build.

📅

**Pay Later with a locked due date** Choose 1 / 3 / 5 days or a custom date. A reminder fires one day before and on the due date. Unlike Splitwise, the due date is enforced.

⏰

**Escalating automated reminders** No response after 1 hour auto-converts to a tracked debt. Bull jobs fire on Day 1 → 2 → 3 → 5 → 7 → 10 → 14, self-cancelling when settled.

🤝

**Disputes with resolution tracking** Declined a split? A dispute is filed with a reason. The payer sees it, sorts it out, and marks it resolved. Full audit trail persisted in DB.

## 🚀 Getting Started

### Prerequisites

Node.js 18+, Docker, Expo CLI, an iOS simulator or physical device, and accounts for Stripe and TrueLayer.

1

**Clone and install dependencies**

```
git clone https://github.com/your-username/settlr.git
cd settlr

# Backend
cd backend && npm install

# Mobile
cd ../mobile && npm install
```

2

**Start the database and Redis**

```
docker-compose up -d
# Runs PostgreSQL on :5432 and Redis on :6379

# Run migrations
cd backend && node src/config/migrate.js
```

3

**Configure environment variables**

backend/.env

```
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/settlr

# Auth
JWT_SECRET=your-secret-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# TrueLayer (open banking)
TRUELAYER_CLIENT_ID=your-client-id
TRUELAYER_CLIENT_SECRET=your-client-secret
TRUELAYER_REDIRECT_URI=http://localhost:3000/banking/callback

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

4

**Set your local IP in the mobile app**

```
# mobile/src/constants/index.js
export const API_URL = 'http://192.168.x.x:3000/api'
export const SOCKET_URL = 'http://192.168.x.x:3000'
```

Run `ifconfig | grep "inet "` on macOS to find your machine's IP on the local network.

5

**Start the backend**

```
cd backend && npm run dev
# API running on http://localhost:3000
```

6

**Run the mobile app**

```
# iOS simulator
cd mobile && npx expo run:ios

# Physical iPhone (requires Apple Developer account)
cd mobile && npx expo run:ios --device
```

7

**Forward Stripe webhooks locally**

```
# Install Stripe CLI, then:
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the webhook signing secret → STRIPE_WEBHOOK_SECRET
```

Built by Manas Patil · [manaspatil2030@gmail.com](mailto:manaspatil2030@gmail.com)
