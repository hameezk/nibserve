# NibServe — Vibe Coding Instructions

> Phase-by-phase execution guide. Each phase is a self-contained, testable, demoable feature slice. Complete them in order.

---

## Phase 0 — Monorepo Skeleton ✅ *(Complete)*

**Status:** Done. See the current repo structure.

**What was built:**
- `infra/docker-compose.yml` — local PostgreSQL 15 + Redis 7
- `apps/api` — NestJS bootstrapped with `ConfigModule`, `TypeOrmModule`, JWT + WebSocket deps
- `apps/admin` — Next.js 14 + TailwindCSS
- `apps/mobile`, `apps/driver`, `apps/dashboard` — Flutter placeholders with full `pubspec.yaml`
- `packages/shared-types` — shared enums + interfaces
- `.env.example` — all variable names
- `.github/workflows/ci.yml` — lint + build API + admin on push

**To run locally:**
```bash
# Start PostgreSQL + Redis
docker compose -f infra/docker-compose.yml up -d

# Start API
cd apps/api && cp .env.example .env && npm install && npm run dev

# Start Admin panel
cd apps/admin && npm install && npm run dev
```

---

## Phase 1 — Auth System

**Copilot/Cursor Prompt:**
> "In the NestJS app at apps/api, create an AuthModule with: POST /auth/verify that accepts a Firebase idToken, verifies it using Firebase Admin SDK (firebase-admin is already installed), creates or fetches the user in PostgreSQL (using TypeORM), and returns a signed JWT access token and refresh token. Add a JwtAuthGuard. Add a UsersModule with GET /users/me. Store refresh tokens in Redis with 30-day TTL. The User entity should have fields: id (UUID), phone, name, email, role (enum: customer/driver/restaurant_owner/admin), fcm_token, created_at, updated_at."

**Deliverables:**
- [ ] Firebase Admin SDK initialized in a `FirebaseModule` (singleton, reads from env)
- [ ] `POST /api/auth/verify` — accepts `{ idToken: string }`, returns `{ accessToken, refreshToken, user }`
- [ ] `POST /api/auth/refresh` — accepts `{ refreshToken: string }`, returns new `{ accessToken, refreshToken }`
- [ ] `POST /api/auth/logout` — invalidates refresh token in Redis
- [ ] `User` entity (TypeORM) with UUID primary key
- [ ] `JwtAuthGuard` in `common/guards/`
- [ ] `RolesGuard` + `@Roles()` decorator in `common/`
- [ ] `UsersModule` with `GET /api/users/me` (protected)
- [ ] `PATCH /api/users/me` — update name, fcm_token
- [ ] Flutter (apps/mobile): Phone number screen → OTP screen → calls `/auth/verify` → stores JWT in secure storage

**Key implementation notes:**
- Firebase Admin SDK: initialize with service account from env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`)
- JWT: short-lived access token (15min), long-lived refresh token (30 days in Redis)
- Redis key pattern: `refresh_token:{userId}:{tokenId}` with 30-day TTL
- On `POST /auth/verify`: `firebaseAdmin.auth().verifyIdToken(idToken)` → extract `phone_number` → upsert user

**Environment variables needed (add to .env):**
```
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES_IN=30d
```

---

## Phase 2 — Restaurant & Menu

**Copilot/Cursor Prompt:**
> "Create RestaurantsModule and MenuModule in apps/api/src. Restaurant entity: id, owner_id (FK to users), name, slug (unique, auto-generated from name), logo_url, address, lat, lng, is_active (default true), average_rating (decimal). Category entity: id, restaurant_id, name, sort_order. MenuItem entity: id, category_id, name, description, price, image_url, is_available. Add endpoints: POST /restaurants (restaurant_owner only), GET /restaurants (public, with lat/lng query params for proximity filter), GET /restaurants/:slug (public), PATCH /restaurants/:id (owner only), GET /restaurants/:id/menu (public). Add Firebase Storage integration: POST /storage/upload-url returns a signed upload URL scoped to the authenticated user."

**Deliverables:**
- [ ] `Restaurant` entity + TypeORM migration
- [ ] `Category` entity + migration
- [ ] `MenuItem` entity + migration
- [ ] `RestaurantsModule` with full CRUD + slug auto-generation
- [ ] Proximity search: `GET /api/restaurants?lat=&lng=&radius=10` (Haversine formula or PostGIS)
- [ ] `MenuModule` with category + item CRUD (owner only for writes, public for reads)
- [ ] `StorageModule`: `POST /api/storage/upload-url` → Firebase Storage signed URL (60s expiry)
- [ ] Dashboard (apps/dashboard): Restaurant profile editor screen
- [ ] Dashboard: Menu manager screen (add/edit/delete categories + items, toggle availability)

**Key implementation notes:**
- Slug: `npm install slugify` → generate from name, ensure uniqueness with suffix if collision
- Firebase Storage signed URL: use `firebase-admin` Storage bucket, `getSignedUrl` with `action: 'write'`, `expires` in 60 seconds
- Role guard: `@Roles(UserRole.RESTAURANT_OWNER)` on write endpoints
- Owner check: verify `restaurant.ownerId === req.user.id` before allowing updates

---

## Phase 3 — Customer Mobile App + Order Flow

**Copilot/Cursor Prompt:**
> "Build out the customer Flutter app (apps/mobile). Add a home screen that uses the device GPS to get coordinates, calls GET /api/restaurants?lat=&lng=&radius=10, and shows restaurants on a Mapbox map and as a list below. Add a restaurant screen showing menu categories and items. Add a cart (local state with Riverpod). Add a cart screen to review items and place an order. In the NestJS backend, create OrdersModule: Order entity (id, customer_id, restaurant_id, driver_id nullable, status, total, address, payment_method), OrderItem entity (id, order_id, menu_item_id, quantity, price). POST /api/orders creates the order and sends FCM notification to the restaurant owner."

**Deliverables:**
- [ ] `Order` entity + migration
- [ ] `OrderItem` entity + migration
- [ ] `POST /api/orders` — creates order + order items, sends FCM to restaurant owner
- [ ] `GET /api/orders/me` — customer's order history
- [ ] `GET /api/orders/:id` — order detail
- [ ] `PATCH /api/orders/:id/status` — restaurant/driver updates status
- [ ] `NotificationsService.sendFcm()` helper (used by orders, reused later)
- [ ] Flutter home screen: GPS → nearby restaurants on Mapbox map + list
- [ ] Flutter restaurant screen: menu browse + add to cart
- [ ] Flutter cart screen: item review + place order
- [ ] Flutter order confirmation screen

**Key implementation notes:**
- FCM: use `firebase-admin` messaging, `sendToDevice(fcmToken, notification)`
- Cart: Riverpod `StateNotifierProvider<CartNotifier, CartState>`
- Mapbox: use `mapbox_maps_flutter` package, show restaurant markers
- Order total: calculate from `sum(item.price * item.quantity)`

---

## Phase 4 — Driver App + Real-time Tracking

**Copilot/Cursor Prompt:**
> "Create a DriverModule in apps/api/src. Driver entity: id, user_id FK, vehicle_type, is_available, current_lat, current_lng. PATCH /api/drivers/me/availability to toggle. When an order is placed (POST /orders), find the nearest available driver using Haversine distance on current_lat/current_lng from the drivers table, and send them an FCM notification. Create a Socket.IO gateway (OrderGateway): driver joins room 'driver:{driverId}', customer joins room 'order:{orderId}'. Driver emits 'driver:location' with lat/lng every 5 seconds, gateway broadcasts to 'order:{orderId}' room. Add PATCH /api/orders/:id/status for driver to update order status."

**Deliverables:**
- [ ] `Driver` entity + migration
- [ ] `POST /api/drivers` — register as driver (driver role users)
- [ ] `PATCH /api/drivers/me/availability` — toggle is_available
- [ ] `PATCH /api/drivers/me/location` — update current_lat/current_lng
- [ ] Nearest driver finder: Haversine query on available drivers
- [ ] `OrderGateway` (Socket.IO): `@WebSocketGateway`
  - Room: `order:{orderId}` — customer subscribes
  - Event: `driver:location_updated` — broadcast driver lat/lng to order room
  - Event: `order:status_updated` — broadcast status changes to order room
- [ ] Driver app: availability toggle on home screen
- [ ] Driver app: incoming order notification (FCM) → accept/decline screen
- [ ] Driver app: active order screen with navigation (Mapbox directions)
- [ ] Driver app: status update buttons (picked up, delivered)
- [ ] Customer app: live tracking screen with driver marker on Mapbox map

**Key implementation notes:**
- Socket.IO auth: verify JWT in `handleConnection` via `client.handshake.auth.token`
- Nearest driver: `ORDER BY (6371 * acos(cos(radians(:lat)) * cos(radians(current_lat)) * cos(radians(current_lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(current_lat)))) ASC LIMIT 1`
- Driver location updates: client-side timer every 5s emitting to server

---

## Phase 5 — Chat + Chatbot

**Copilot/Cursor Prompt:**
> "Add a ChatModule to apps/api/src. Create chat_messages table: id, order_id, sender_id, sender_type (customer/driver/restaurant/bot), message, created_at. Create chatbot_rules table: id, restaurant_id, trigger_keywords (text array), response_text, category. Add ChatGateway (WebSocket): users join room 'chat:{orderId}'. When a message is sent, persist it, check if sender is customer and chatbot rules match (tokenize message, check if any keyword is included), auto-reply if matched or send fallback. Add REST: POST /api/chatbot/rules, GET /api/chatbot/rules (owner only), DELETE /api/chatbot/rules/:id. GET /api/chat/:orderId/messages (paginated)."

**Deliverables:**
- [ ] `ChatMessage` entity + migration
- [ ] `ChatbotRule` entity + migration (trigger_keywords as `simple-array` or `jsonb`)
- [ ] `ChatGateway`: `chat:message` event → persist → chatbot check → broadcast
- [ ] `ChatbotService.match(message, restaurantId)` — tokenize + keyword check
- [ ] `POST /api/chatbot/rules` (restaurant owner only)
- [ ] `GET /api/chatbot/rules` (owner only, scoped to their restaurant)
- [ ] `DELETE /api/chatbot/rules/:id`
- [ ] `GET /api/chat/:orderId/messages` (paginated, order participants only)
- [ ] Dashboard: Chatbot rules manager screen (list, add, delete rules)
- [ ] Mobile: In-order chat screen (real-time via Socket.IO)

**Key implementation notes:**
- Keyword matching: `message.toLowerCase().split(/\s+/).some(word => rule.triggerKeywords.includes(word))`
- Chatbot fallback message: `"Sorry, please contact the restaurant directly."`
- Room authorization: verify user is customer, driver, or restaurant owner of this order
- Persist bot replies as `sender_type: 'bot'`

---

## Phase 6 — Reviews + Notifications

**Copilot/Cursor Prompt:**
> "Add ReviewsModule: Review entity (id, order_id, customer_id, restaurant_id, rating 1-5, comment, created_at). POST /api/reviews — only allowed if order status is 'delivered' and no review exists for this order yet. After creating a review, recalculate and update restaurant.average_rating (SELECT AVG(rating) FROM reviews WHERE restaurant_id = ?). Add NotificationsModule: Notification entity (id, user_id, title, body, type, is_read, created_at). GET /api/notifications/me (paginated), PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all. Update the FCM send helper to also persist to notifications table."

**Deliverables:**
- [ ] `Review` entity + migration
- [ ] `POST /api/reviews` — validated (delivered order, no duplicate)
- [ ] `GET /api/reviews/restaurant/:restaurantId` — public, paginated
- [ ] Restaurant `average_rating` updated after each review
- [ ] `Notification` entity + migration
- [ ] `GET /api/notifications/me` — paginated, newest first
- [ ] `PATCH /api/notifications/:id/read`
- [ ] `PATCH /api/notifications/read-all`
- [ ] `GET /api/notifications/me/unread-count`
- [ ] All FCM sends now also persist to `notifications` table
- [ ] Mobile: Post-delivery review submission screen (triggered when order delivered)
- [ ] Mobile: Notifications screen with unread badge on bell icon

---

## Phase 7 — Admin Panel

**Copilot/Cursor Prompt:**
> "In apps/admin (Next.js 14 App Router + TailwindCSS), build the following pages: /login (email + password auth, POST /api/admin/auth/login returns JWT), /restaurants (table of all restaurants with approve/suspend toggle, calls PATCH /api/admin/restaurants/:id), /users (table of all users with role filter), /orders (table of all orders with status filter and date range), /analytics (cards: total orders today/this week, total revenue, active restaurants, new users this week; use recharts for charts). Use shadcn/ui for all UI components. In the NestJS backend, add AdminModule with these endpoints, protected by admin role only."

**Deliverables:**
- [ ] `AdminModule` in NestJS with all admin-scoped endpoints
- [ ] Admin-specific auth: `POST /api/admin/auth/login` (email + bcrypt, not Firebase)
- [ ] `GET /api/admin/restaurants` — all restaurants (paginated, filterable)
- [ ] `PATCH /api/admin/restaurants/:id` — approve/suspend (`is_active` toggle)
- [ ] `GET /api/admin/users` — all users (paginated, role filter)
- [ ] `GET /api/admin/orders` — all orders (paginated, status + date filter)
- [ ] `GET /api/admin/analytics` — aggregated stats
- [ ] Next.js: `/login` page with JWT stored in httpOnly cookie
- [ ] Next.js: `/restaurants` page with approve/suspend
- [ ] Next.js: `/users` page
- [ ] Next.js: `/orders` page
- [ ] Next.js: `/analytics` page with recharts
- [ ] Install `shadcn/ui`: `npx shadcn-ui@latest init` in `apps/admin`

**Key implementation notes:**
- Admin login: store hashed password in `users` table with `role: admin`
- Use Next.js middleware for route protection (check JWT cookie)
- Admin JWT is separate from the user JWT (different secret or same — your choice)

---

## Phase 8 — Production Deploy

**Copilot/Cursor Prompt:**
> "Set up production deployment for NibServe. The Caddyfile and docker-compose.prod.yml already exist in infra/. Update the GitHub Actions deploy workflow (.github/workflows/deploy.yml): on push to main, SSH into Hetzner VPS (secrets: HETZNER_HOST, HETZNER_USER, HETZNER_SSH_KEY), cd /opt/nibserve, git pull, docker compose -f infra/docker-compose.prod.yml up -d --build. Add a second job to build apps/admin with next build and deploy to Firebase Hosting using FirebaseExtended/action-hosting-deploy. Add firebase.json and .firebaserc to the repo root."

**Deliverables:**
- [ ] `firebase.json` — hosting config for admin + dashboard targets
- [ ] `.firebaserc` — project aliases
- [ ] GitHub Actions secrets documented in README:
  - `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`
  - `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`
  - All API env vars as GitHub secrets
- [ ] VPS setup script (`infra/setup-vps.sh`): install Docker, Docker Compose, clone repo
- [ ] Production smoke test checklist

**VPS First-Time Setup (manual, one-time):**
```bash
# On Hetzner VPS (Ubuntu 22.04)
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git
systemctl enable docker

mkdir -p /opt/nibserve
cd /opt/nibserve
git clone https://github.com/hameezk/nibserve.git .

# Create .env from .env.example
cp .env.example .env
# Edit .env with production values
nano .env

# Start everything
docker compose -f infra/docker-compose.prod.yml up -d
```

**GitHub Secrets to configure:**

| Secret | Description |
|---|---|
| `HETZNER_HOST` | VPS IP address |
| `HETZNER_USER` | SSH username (e.g. `root`) |
| `HETZNER_SSH_KEY` | Private SSH key (PEM format) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON (stringified) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `DB_USERNAME` | Production DB username |
| `DB_PASSWORD` | Production DB password (strong random) |
| `DB_NAME` | Production DB name |
| `JWT_SECRET` | Production JWT secret (min 64 chars) |
| `REFRESH_TOKEN_SECRET` | Production refresh token secret |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK private key |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK client email |

---

## Development Workflow

### Starting fresh on a new machine

```bash
git clone https://github.com/hameezk/nibserve.git
cd nibserve

# Start local infrastructure
docker compose -f infra/docker-compose.yml up -d

# API
cd apps/api
cp .env.example .env
# Fill in .env values
npm install
npm run dev
# → http://localhost:3000/api

# Admin panel
cd apps/admin
npm install
npm run dev
# → http://localhost:3001
```

### Running tests

```bash
# API unit tests
cd apps/api && npm test

# API e2e tests (requires running PostgreSQL + Redis)
cd apps/api && npm run test:e2e
```

### Adding a new NestJS module

```bash
cd apps/api
npx nest generate module <name>
npx nest generate controller <name>
npx nest generate service <name>
```

---

## Phase Completion Checklist

| Phase | Description | Status |
|---|---|---|
| 0 | Monorepo skeleton | ✅ Done |
| 1 | Auth system (Firebase OTP + JWT) | ⬜ Todo |
| 2 | Restaurants & menu | ⬜ Todo |
| 3 | Customer app + order flow | ⬜ Todo |
| 4 | Driver app + real-time tracking | ⬜ Todo |
| 5 | Chat + chatbot | ⬜ Todo |
| 6 | Reviews + notifications | ⬜ Todo |
| 7 | Admin panel | ⬜ Todo |
| 8 | Production deploy | ⬜ Todo |
