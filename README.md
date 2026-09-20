# Daleel Backend

> **Daleel** (دليل) — Arabic for "guide". A mentorship platform that connects mentors and mentees to grow together.

## What is Daleel?

Daleel is a full-stack mentorship platform where professionals can offer guidance and learners can find the right mentor. The backend is a REST API built with NestJS.

### Planned Features

- **Authentication** — Sign up, log in, and manage your profile.
- **Mentor Discovery** — Search and filter mentors by expertise, availability, and more.
- **AI Matching** — Smart recommendations that pair mentees with the best-fit mentors.
- **Become a Mentor** — Any user can opt in as a mentor by completing their mentor profile.
- **Real-time Chat** — Direct messaging between mentors and mentees.
- **Calendar & Scheduling** — Book sessions with integrated calendar views.
- **In-app Meetings** — Video/audio meetings without leaving the platform.

> The feature set is actively evolving — implementation details will be defined as development progresses.

## Tech Stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| Framework       | NestJS 12                           |
| Language        | TypeScript 6                        |
| Database        | PostgreSQL (via Prisma ORM)         |
| Validation      | class-validator / class-transformer |
| API Docs        | Swagger (`@nestjs/swagger`)         |
| Logging         | Pino (`nestjs-pino`)                |
| Testing         | Vitest + Supertest                  |
| Linting         | OxLint (type-aware)                 |
| Formatting      | Prettier                            |
| Git Hooks       | Husky + lint-staged                 |
| Package Manager | pnpm (workspaces)                   |

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **pnpm** ≥ 10
- **PostgreSQL** running locally or via Docker

### Installation

```bash
# Clone the repo
git clone git@github.com:daleel-platform/daleel-backend.git
cd daleel-backend

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database credentials and secrets
```

### Database Setup

```bash
# Generate Prisma client
pnpm prisma:generate

# Run migrations
pnpm prisma:migrate:dev

# (Optional) Open Prisma Studio
pnpm prisma:studio
```

### Running the App

```bash
# Development (watch mode)
pnpm start:dev

# Production
pnpm build
pnpm start:prod
```

The API will be available at `http://localhost:3000`.

### Testing

```bash
pnpm test          # Run unit tests
pnpm test:e2e      # Run end-to-end tests
pnpm test:cov      # Run tests with coverage
```

### Linting & Formatting

```bash
pnpm lint          # OxLint (type-aware)
pnpm format        # Prettier
```

> Husky + lint-staged run linting and formatting automatically on every commit.

## Project Structure

```
src/
├── main.ts            # Application entry point
├── app.module.ts      # Root module
├── common/            # Shared utilities, guards, pipes, decorators
├── config/            # Configuration & environment validation
├── modules/           # Feature modules (auth, users, mentors, etc.)
└── prisma/            # Prisma service & module
```

## Environment Variables

| Variable         | Description                  | Example                                                          |
| ---------------- | ---------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`       | Runtime environment          | `development`                                                    |
| `PORT`           | Server port                  | `3000`                                                           |
| `DATABASE_URL`   | PostgreSQL connection string | `postgresql://user:password@localhost:5432/daleel?schema=public` |
| `JWT_SECRET`     | Secret for signing JWTs      | _(use a strong random value)_                                    |
| `JWT_EXPIRATION` | Token lifetime               | `7d`                                                             |

## License

This project is **UNLICENSED** — proprietary and confidential.
