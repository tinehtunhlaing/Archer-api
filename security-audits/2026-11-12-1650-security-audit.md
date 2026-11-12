# Archer API Security Audit

**Audited:** 2026-11-12 16:50 Asia/Yangon (UTC+06:30)

**Scope:** Static review of the API implementation in `api/src`, `api/scripts`, Prisma schema and migration, package configuration, `.env.example`, and API README.

**Method:** Read-only source review. No tests, exploit attempts, dependency scans, database inspection, or live deployment checks were performed.

## Executive summary

The API has useful baseline protections: bcrypt password hashing, short-lived signed JWTs with issuer and audience validation, role gates, per-object ownership checks, Zod validation on request bodies and most query inputs, Helmet defaults, a 1 MB JSON body limit, and authentication-route rate limiting. The central high-risk issue is that production configuration accepts the known JWT secret placeholder from `.env.example`. Other material concerns are unthrottled API operations, unbounded authenticated list queries, and logging of raw unexpected exceptions.

**Overall risk: High if the example JWT secret is deployed; otherwise Moderate pending abuse controls and list limits.**

## Findings

### [P1] Production accepts the published JWT secret placeholder

`api/.env.example` sets `JWT_SECRET=replace-with-a-long-random-secret`. The configuration validates only that the value is at least 32 characters (`api/src/config.ts:4-10`), and applies no production-specific check. The README asks operators to replace it, but the server does not prevent startup if they forget (`api/README.md:19`).

If this known value is used in a deployment, anyone who knows it can sign tokens accepted by `requireAuth` (`api/src/auth.ts:38-53`). Since the token carries its role and subject, an attacker could impersonate accounts and access or modify data allowed to that identity. Public profile data may also disclose user IDs that can be used as token subjects.

**Remediation:** Reject the example placeholder and other known development values at startup. Require a deployment-provided, randomly generated secret in production (preferably at least 32 bytes of entropy, not merely 32 characters), and document secret rotation. Consider separate secrets per environment.

### [P2] Write and search endpoints have no general request throttling

The only rate limiter is mounted on `/api/auth` (`api/src/app.ts:20-28`). The remaining routes have no visible IP- or account-based request limits. An authenticated user can repeatedly create messages (`api/src/routes/conversations.routes.ts:47-54`) or jobs (`api/src/routes/jobs.routes.ts:81-88`), and public job search performs database substring searches (`api/src/routes/jobs.routes.ts:31-49`). Body and field-size limits restrict each request but do not bound aggregate writes or query volume.

This creates an avoidable database and service availability risk from a compromised account or a user automating valid requests. The current in-memory auth limiter also would need a shared store if deployed across multiple API instances.

**Remediation:** Add appropriately sized limits for expensive public search and authenticated write operations, preferably with account-aware limits for authenticated actions and a shared limiter store in multi-instance deployments. Ensure proxy configuration supplies a trustworthy client IP before relying on IP-based limits.

### [P2] Authenticated proposal and conversation lists are unbounded

`GET /api/proposals/me` returns every proposal for an account (`api/src/routes/proposals.routes.ts:16-25`); `GET /api/proposals/jobs/:jobId` returns every proposal for the job (`api/src/routes/proposals.routes.ts:28-40`); and `GET /api/conversations` returns every conversation for an account (`api/src/routes/conversations.routes.ts:21-32`). Unlike jobs and message history, these queries have no validated limit or cursor. As data grows, one request can produce large database work and response bodies, which can degrade availability and increase memory use.

**Remediation:** Add bounded, validated pagination with stable ordering to all three endpoints. Keep ownership and participant filters in the database query, and return a continuation cursor rather than loading the complete collection.

### [P2] Unexpected exceptions are written to logs without redaction

The error handler sends a generic 500 response, which is good, but also writes the full exception object to standard error (`api/src/http.ts:84-85`). Unexpected ORM and driver errors can contain request-derived values or database details. Those values can then persist in deployment logs accessible to operators or log-service accounts.

**Remediation:** Log a sanitized error identifier, category, and stack according to the deployment’s access and retention policy. Avoid logging ORM error metadata or values unless explicitly redacted; keep the response generic as it is now.

## Positive controls observed

- Passwords are hashed with bcrypt cost 12 (`api/src/auth.ts:18-24`).
- JWT verification checks signature, issuer, audience, expiry, subject, and role shape (`api/src/auth.ts:30-53`).
- Client and freelancer routes apply role gates, and ownership/participation is checked server-side in job, proposal, and conversation operations.
- Request schemas constrain content sizes and reject unknown fields in mutation payloads.
- Error responses avoid returning unhandled exception details to API callers.
- CORS uses configured origins, credentials are disabled, Helmet is enabled, and `X-Powered-By` is disabled.
- The `.env` file is ignored by Git; `.env.example` contains a placeholder rather than a real credential.

## Review notes and limits

- The local `api/.env` was not opened or included in this review.
- No runtime behavior, dependency vulnerabilities, proxy/TLS configuration, production secret store, deployment topology, or database exposure was verified.
- The `api/tests` suite exists, but was not run as this was a static security review.
- Prioritize removing the production placeholder acceptance before deployment, then add request limits and pagination. Revisit logging as part of production observability hardening.
