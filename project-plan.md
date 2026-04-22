# NibServe — Project Plan

## 🏗️ What We're Building

A **multi-tenant food delivery SaaS platform** (like Noon Food / Talabat) where:
- Multiple restaurants onboard themselves
- Customers order food via mobile app (iOS + Android)
- Delivery drivers pick up and deliver orders
- Restaurant owners manage their store via a web dashboard
- A super-admin manages the whole platform

---

## 🧱 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend API** | NestJS (Node.js) + TypeScript | Structured, scalable, great DX |
| **Database** | PostgreSQL | Relational, reliable |
| **Cache / Queues** | Redis | Sessions, rate limiting, job queues |
| **Real-time** | Socket.IO (via NestJS gateway) | Live order tracking, chat |
| **Auth / OTP** | Firebase Phone Auth | 10k free verifications/month |
| **Push Notifications** | Firebase FCM | Free, unlimited |
| **File Storage** | Firebase Storage | 5 GB free, same Firebase project |
| **Maps** | Mapbox | 50k map loads/month free |
| **Chatbot** | Rule-based (admin-configured, no LLM) | Free, fully controlled |
| **Payments** | Deferred (cash on delivery only for now) | No Stripe yet |
| **Mobile App** | Flutter (iOS + Android) | Single codebase |
| **Restaurant Dashboard** | Flutter Web | Single codebase, reuses mobile logic |
| **Admin Panel** | Next.js | SEO-friendly, great for data-heavy dashboards |
| **Hosting — Frontend** | Firebase Hosting | 10 GB free, custom domain, auto SSL |
| **Hosting — Backend** | Hetzner CX22 VPS (~€4.51/mo) | Docker Compose: NestJS + PostgreSQL + Redis |
| **Reverse Proxy / SSL** | Caddy on Hetzner | Auto Let's Encrypt, zero config |
| **CI/CD** | GitHub Actions | Free for public repos |
| **Error Monitoring** | Sentry | 5k errors/month free |

---

## 📦 Monorepo Structure

```
nibserve/
├── apps/
│   ├── api/                  ← NestJS backend
│   ├── mobile/               ← Flutter (customer app)
│   ├── driver/               ← Flutter (driver app)
│   ├── dashboard/            ← Flutter Web (restaurant owner)
│   └── admin/                ← Next.js (super admin panel)
├── packages/
│   ├── shared-types/         ← TypeScript types shared across apps
│   └── ui-components/        ← (future) shared UI
├── infra/
│   ├── docker-compose.yml    ← Local dev: PostgreSQL + Redis
│   ├── docker-compose.prod.yml ← Production stack
│   ├── Caddyfile             ← Production reverse proxy config
│   └── nginx/                ← Alternative if needed
├── .github/
│   └── workflows/            ← CI/CD pipelines
├── project-plan.md           ← This file
├── vibecode-instructions.md  ← Phase-by-phase execution guide
└── README.md
```

---

## 🗃️ Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| phone | VARCHAR UNIQUE | Firebase phone |
| name | VARCHAR | |
| email | VARCHAR | Optional |
| role | ENUM | customer, driver, restaurant_owner, admin |
| fcm_token | VARCHAR | For push notifications |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `restaurants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| owner_id | UUID FK → users | |
| name | VARCHAR | |
| slug | VARCHAR UNIQUE | URL-friendly name |
| logo_url | VARCHAR | Firebase Storage URL |
| address | TEXT | |
| lat | DECIMAL | Geolocation |
| lng | DECIMAL | Geolocation |
| is_active | BOOLEAN | Admin can suspend |
| average_rating | DECIMAL | Cached from reviews |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| restaurant_id | UUID FK → restaurants | |
| name | VARCHAR | |
| sort_order | INTEGER | Display ordering |

### `menu_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| category_id | UUID FK → categories | |
| name | VARCHAR | |
| description | TEXT | |
| price | DECIMAL | |
| image_url | VARCHAR | Firebase Storage URL |
| is_available | BOOLEAN | |

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_id | UUID FK → users | |
| restaurant_id | UUID FK → restaurants | |
| driver_id | UUID FK → drivers | Nullable until assigned |
| status | ENUM | pending, confirmed, preparing, ready_for_pickup, en_route_to_restaurant, picked_up, en_route_to_customer, delivered, cancelled |
| total | DECIMAL | |
| address | TEXT | Delivery address |
| payment_method | ENUM | cash_on_delivery |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| menu_item_id | UUID FK → menu_items | |
| quantity | INTEGER | |
| price | DECIMAL | Snapshot at order time |

### `drivers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| vehicle_type | VARCHAR | motorcycle, car, bicycle |
| is_available | BOOLEAN | |
| current_lat | DECIMAL | Live location |
| current_lng | DECIMAL | Live location |

### `reviews`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| customer_id | UUID FK → users | |
| restaurant_id | UUID FK → restaurants | |
| rating | INTEGER | 1–5 |
| comment | TEXT | |
| created_at | TIMESTAMP | |

### `chatbot_rules`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| restaurant_id | UUID FK → restaurants | |
| trigger_keywords | TEXT[] | Array of keywords |
| response_text | TEXT | Auto-reply message |
| category | VARCHAR | Optional grouping |

### `chat_messages`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK → orders | Room identifier |
| sender_id | UUID FK → users | |
| sender_type | ENUM | customer, driver, restaurant, bot |
| message | TEXT | |
| created_at | TIMESTAMP | |

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| title | VARCHAR | |
| body | TEXT | |
| type | VARCHAR | order_update, chat, promotion |
| is_read | BOOLEAN | |
| created_at | TIMESTAMP | |

---

## 🔐 Auth Flow

1. User enters phone number in app
2. App calls Firebase Phone Auth → Firebase sends OTP SMS (free, 10k/mo)
3. User enters OTP → Firebase validates → returns `idToken`
4. App sends `idToken` to NestJS backend `POST /api/auth/verify`
5. Backend verifies token with Firebase Admin SDK → creates/fetches user in PostgreSQL → returns JWT
6. All subsequent requests use JWT (`Authorization: Bearer <token>`)
7. Refresh tokens stored in Redis with 30-day TTL

---

## 🤖 Chatbot Architecture (Rule-Based)

- Restaurant owner creates rules in the Dashboard:
  - `trigger_keywords: ["hours", "open", "timing"]` → `response: "We are open 10am–11pm daily"`
- Customer sends a message during an active order
- Backend tokenizes message → matches against restaurant's rules → returns first match
- Fallback: `"Sorry, please contact the restaurant directly: {phone}"`
- **No LLM, no API cost — 100% free**

---

## 🌍 API Module Breakdown (NestJS)

```
apps/api/src/
├── auth/             ← Firebase OTP verify, JWT issue/refresh
├── users/            ← Profile CRUD
├── restaurants/      ← CRUD, search, slug routing
├── menu/             ← Categories + items CRUD
├── orders/           ← Place order, status updates, history
├── drivers/          ← Location updates, assignment, availability
├── chat/             ← WebSocket gateway + message persistence
├── chatbot/          ← Rule matching engine
├── notifications/    ← FCM push dispatch
├── reviews/          ← Submit/read ratings
├── storage/          ← Firebase Storage signed URLs
├── admin/            ← Platform-level management
└── common/           ← Guards, interceptors, filters, decorators
```

---

## 📱 App Screen Breakdown

### Customer Mobile App (Flutter)
```
Auth:         Phone Entry → OTP → Profile Setup
Home:         Restaurant List (by proximity via Mapbox geocoding)
Restaurant:   Menu browse → Add to cart
Cart:         Review items → Place order (cash on delivery)
Order:        Live tracking screen (Mapbox + Socket.IO driver location)
              In-order chat (Socket.IO + chatbot fallback)
Profile:      Orders history, account settings
```

### Driver App (Flutter)
```
Auth:         Phone OTP → Driver profile
Home:         Toggle availability, incoming order alerts (FCM)
Order:        Accept/decline → Navigate to restaurant (Mapbox) → Navigate to customer
Status:       Update order status (picked up, delivered)
Earnings:     History (future)
```

### Restaurant Dashboard (Flutter Web)
```
Auth:         Phone OTP → Restaurant profile
Dashboard:    Today's orders, revenue summary
Menu:         Categories + items (add/edit/toggle availability)
Orders:       Live queue (Socket.IO), update status
Chatbot:      Manage rules (keywords → responses)
Profile:      Restaurant info, logo upload (Firebase Storage)
```

### Admin Panel (Next.js)
```
Auth:         Email + password (internal only, bcrypt)
Restaurants:  Approve/suspend restaurants
Users:        View all users, roles
Orders:       Platform-wide order monitoring
Analytics:    Revenue, orders, growth charts
```

---

## 🏠 Hosting Architecture

```
Firebase Hosting:
  └── nibserve.web.app         ← Admin Panel (Next.js static export)
  └── dashboard.nibserve.app   ← Restaurant Dashboard (Flutter Web)

Hetzner CX22 VPS (~€4.51/mo):
  └── Caddy (reverse proxy + auto SSL via Let's Encrypt)
      ├── api.nibserve.app     → NestJS (port 3000)
      └── Internal Docker network:
          ├── PostgreSQL (port 5432, internal only)
          └── Redis (port 6379, internal only)
```

---

## 💰 Cost at Launch

| Item | Cost |
|---|---|
| Hetzner CX22 VPS | €4.51/month |
| Firebase (Auth + FCM + Storage + Hosting) | Free |
| Mapbox | Free (50k loads/month) |
| Sentry | Free (5k errors/month) |
| GitHub Actions | Free (public repos) |
| **Total recurring** | **~€4.51/month** |
| Google Play (one-time) | $25 |
| Apple Developer (annual) | $99/year |
