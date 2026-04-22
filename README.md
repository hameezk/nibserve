# NibServe 🍽️

A multi-tenant food delivery SaaS platform — built with NestJS, Flutter, and Next.js.

## Architecture

| Layer | Tech |
|---|---|
| Backend API | NestJS + TypeScript + PostgreSQL + Redis |
| Customer App | Flutter (iOS + Android) |
| Driver App | Flutter (iOS + Android) |
| Restaurant Dashboard | Flutter Web |
| Admin Panel | Next.js 14 + TailwindCSS |
| Auth | Firebase Phone Auth (OTP) |
| Notifications | Firebase FCM |
| File Storage | Firebase Storage |
| Maps | Mapbox |
| Hosting (Frontend) | Firebase Hosting |
| Hosting (Backend) | Hetzner VPS + Caddy + Docker |

## Monorepo Structure

```
nibserve/
├── apps/
│   ├── api/          ← NestJS backend
│   ├── mobile/       ← Flutter customer app
│   ├── driver/       ← Flutter driver app
│   ├── dashboard/    ← Flutter Web restaurant dashboard
│   └── admin/        ← Next.js admin panel
├── packages/
│   └── shared-types/ ← Shared TypeScript types
├── infra/
│   ├── docker-compose.yml      ← Local dev
│   ├── docker-compose.prod.yml ← Production
│   └── Caddyfile               ← Reverse proxy
└── .github/workflows/          ← CI/CD
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Flutter 3.x (for mobile/dashboard apps)

### Local Development

1. **Clone the repo**
   ```bash
   git clone https://github.com/hameezk/nibserve.git
   cd nibserve
   ```

2. **Start infrastructure** (PostgreSQL + Redis)
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

3. **Set up the API**
   ```bash
   cd apps/api
   cp .env.example .env
   # Edit .env with your values
   npm install
   npm run dev
   ```

4. **Set up the Admin Panel**
   ```bash
   cd apps/admin
   npm install
   npm run dev
   ```

### Environment Variables

See `.env.example` for all required environment variables.

## Deployment

- **Backend**: Hetzner CX22 VPS via Docker Compose + Caddy
- **Admin Panel**: Firebase Hosting
- **Restaurant Dashboard**: Firebase Hosting

See `infra/` for deployment configs and `.github/workflows/` for CI/CD pipelines.

## Cost

~€4.51/month (Hetzner VPS only — everything else is free tier)

## License

MIT
