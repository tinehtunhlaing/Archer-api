# Archer API

Standalone Express API project for Archer. The API owns authentication, authorization, validation, and data access. It is intended to be versioned and deployed independently from the web and mobile clients.

## Stack

- Node.js 20.19 or newer, TypeScript, Express 5
- SQLite with Prisma ORM 7 and the `better-sqlite3` driver adapter
- JWT access tokens; passwords are hashed with bcrypt
- Zod request validation

## Local setup

```sh
npm install
cp .env.example .env
```

Set `JWT_SECRET` in `.env` to a random value of at least 32 characters. Then create the local schema and start the server:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:4000`. The health endpoint is `GET /api/health`.

## Authentication and roles

Public registration accepts only `CLIENT` or `FREELANCER`. Admin accounts cannot be created through the public API. Provision the first admin explicitly in a trusted local or deployment environment:

```sh
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='use-a-long-unique-secret' npm run admin:create
```

Send access tokens as `Authorization: Bearer <token>`. Tokens are short-lived and stateless. Refresh, logout/revocation, email verification, and password reset flows are not implemented yet.

Each account has one role. Client and freelancer operations are role-gated, and object ownership is checked by the API. Admin has no product permissions implemented yet; define those before adding admin routes.

## Local sample accounts

`npm run db:seed` creates or updates 24 sample clients, 96 sample freelancers, 1 demo admin, 240 jobs, 720 proposals and conversations, and 1,584 messages. All sample emails use the reserved `.test` domain. The seed is deterministic and safe to rerun against the local development database.

- Client: `seed.client.001@archer.example.test`
- Freelancer: `seed.freelancer.001@archer.example.test`
- Admin: `demo.admin@archer.example.test`
- Password for every sample account: `ArcherSample2026!`

Use these accounts only with local sample data. Do not run the seed against a live database or expose a development API with these credentials.

## API routes

All routes are under `/api` and return JSON. Success payloads use `{ "data": ... }`; errors use `{ "error": { "code": ..., "message": ... } }`.

Error messages are returned in English by default. Clients can request Burmese error messages with `Accept-Language: my` (or `my-MM`); the response includes the selected locale in `Content-Language`. Stable error `code` values are language-independent.

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Create client/freelancer and profile |
| POST | `/auth/login` | Public | Sign in |
| GET | `/auth/me` | Authenticated | Current account |
| GET, PUT | `/profiles/me` | Authenticated | Read/update own profile |
| GET | `/profiles/:userId` | Public | Read public profile |
| GET | `/jobs` | Public | Browse open jobs; supports `q`, `currency`, `limit`, `cursor` |
| GET | `/jobs/:jobId` | Public | Read an open job |
| POST | `/jobs` | Client | Create a job |
| PATCH | `/jobs/:jobId/close` | Owning client | Close a job |
| GET | `/proposals/me` | Freelancer | List own proposals |
| POST | `/proposals/jobs/:jobId` | Freelancer | Submit proposal and create its conversation |
| GET | `/proposals/jobs/:jobId` | Owning client | List proposals on a job |
| PATCH | `/proposals/:proposalId/withdraw` | Owning freelancer | Withdraw a pending proposal |
| PATCH | `/proposals/:proposalId/reject` | Owning client | Reject a pending proposal |
| GET | `/conversations` | Participant | List own conversations |
| GET, POST | `/conversations/:conversationId/messages` | Participant | Read/send messages |

## Initial behavior choices

- Applying to an open job creates a conversation between the job's client and the applicant. Messaging is limited to those participants.
- Proposal statuses are `PENDING`, `WITHDRAWN`, and `REJECTED`. Hiring/acceptance is not part of the MVP yet.
- Job budgets and proposal bids are stored as decimal strings (up to four fractional digits) to avoid binary floating-point loss. The USD/MMK fractional precision and display rules remain product decisions.
- No payment processing, currency conversion, attachments, read receipts, email verification, or password reset is implemented.
- Admin permissions are intentionally unimplemented pending product requirements.

## Commands

- `npm run dev` — development server with reload
- `npm run build` — generate Prisma client and compile TypeScript
- `npm run start` — run compiled server
- `npm run typecheck` — Prisma generation and TypeScript check
- `npm run db:migrate -- --name <migration>` — create/apply local development migration
- `npm run db:deploy` — apply committed migrations in deployment
- `npm run db:seed` — add or update local sample accounts and marketplace activity
- `npm run db:studio` — open Prisma Studio
