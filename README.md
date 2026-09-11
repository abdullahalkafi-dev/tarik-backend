# Tarik Backend

Backend service for Tarik — a job marketplace connecting clients with local service helpers in Morocco.

## Tech Stack

- **Runtime & Language**: Node.js, TypeScript
- **Framework**: Express 5
- **Database**: MongoDB (via Mongoose 9)
- **Caching & Pub/Sub**: Redis
- **Real-time**: Socket.IO (with Redis adapter)
- **Storage**: AWS S3 / MinIO (compatible object storage)
- **Authentication**: JWT (Access & Refresh tokens), Bcrypt
- **Validation**: Zod 4
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Containerization**: Docker & Docker Compose

---

## Project Structure

```
tarik-backend/
├── src/
│   ├── Builder/          # Query builder helpers
│   ├── config/           # Application configuration and environment loader
│   ├── db/               # Database connection and seed scripts
│   ├── errors/           # Global error handling and custom error classes
│   ├── jobs/             # Scheduled cron jobs
│   ├── jwt/              # JWT helper utilities
│   ├── logger/           # Winston logger & Morgan HTTP loggers
│   ├── mail/             # Email templates and dispatchers
│   ├── middlewares/      # Express middlewares (auth, validation, security, rate limit)
│   ├── module/           # Domain feature modules (user, auth, job, chat, payment, etc.)
│   ├── redis/            # Redis client and caching services
│   ├── routes/           # Central API routes aggregator
│   ├── shared/           # Utility functions, catchAsync, sendResponse
│   ├── socket/           # Real-time chat & notifications Socket.IO handlers
│   ├── types/            # TypeScript type declarations
│   ├── util/             # Utility services (S3, MinIO, Firebase, Stripe, etc.)
│   ├── app.ts            # Express application setup
│   └── server.ts         # Server entry point
├── __tests__/            # Unit and integration test suites
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Development environment compose file
├── package.json
└── tsconfig.json
```

---

## Getting Started

### 1. Prerequisites
- Node.js >= 20
- pnpm (recommended) or npm
- MongoDB
- Redis

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Running the Development Server
```bash
pnpm dev
```

Or using Docker:
```bash
docker compose up app-dev
```

### 5. Running Tests & Build
```bash
# Run tests
pnpm test

# Build production bundle
pnpm build

# Start production server
pnpm start
```
