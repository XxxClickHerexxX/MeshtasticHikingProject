# Hiking with Confidence

Production-oriented full-stack Meshtastic route safety platform.

## What it includes

- Secure login with session-based auth (`express-session`) and server-side RBAC.
- Roles: **Administrator**, **Coordinator**, **Hiker**, **Viewer**.
- Mesh route management (create/update/delete, activate/deactivate metadata, approved nodes).
- User management (create/update/suspend, role assignment, geolock-required flag).
- Geofence/geolock policy checks (named zone, center/radius, warn/restrict/alert behavior, accuracy/freshness validation).
- Alert lifecycle for: Injury, Lost, Off track, Bad weather, Emergency, Other.
- Emergency/Critical alert confirmation requirement.
- Coordinator/Admin acknowledgment, actions log, resolve flow.
- Dashboard summaries (active alerts, route status, user/geolock stats, mesh adapter status, recent activity).
- Audit logging for auth, user changes, mesh/geofence changes, alert lifecycle, escalation events.
- Notification abstraction with development-safe local implementation and extension points for web push/email/SMS.
- Meshtastic integration abstraction with mock adapter by default and optional MQTT adapter.
- Security middleware (helmet), rate limiting for login, request validation (zod), safe error handling.

## Important security and operational limitation

A web platform cannot physically stop LoRa radio communication between Meshtastic devices that already possess channel credentials. Controls in this app are implemented at account/backend/API policy, MQTT bridge, approved-node metadata, and audit/governance layers.

## Tech stack

- Node.js + Express + EJS frontend
- PostgreSQL support with SQL migrations/seeds (`db/migrations`, `db/seeds`)
- Memory/file persistence adapter for local developer convenience/tests

## Quick start (memory adapter)

```bash
npm install
cp .env.example .env
npm run dev
```

Set in `.env`:

```env
STORAGE_ADAPTER=memory
```

Login demo accounts (password for all: `ChangeMe123!`):

- admin@hikingwithconfidence.local
- coordinator@hikingwithconfidence.local
- hiker@hikingwithconfidence.local
- viewer@hikingwithconfidence.local

## PostgreSQL setup (recommended)

1. Start PostgreSQL (Docker Compose below or your own managed service).
2. Set `.env`:

```env
STORAGE_ADAPTER=postgres
DATABASE_URL=postgresql://localhost:5432/hiking_with_confidence
SESSION_SECRET=replace-me
```

3. Run migration + seed:

```bash
npm run migrate
npm run seed
```

4. Start app:

```bash
npm start
```

## Docker / dev container

```bash
cp .env.example .env
# edit .env and set STORAGE_ADAPTER=postgres + DATABASE_URL
docker compose up --build
```

## Meshtastic / MQTT integration

- By default, `MQTT_ENABLED=false` uses a safe mock adapter.
- To enable real MQTT bridge:
  - set `MQTT_ENABLED=true`
  - configure `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC_PREFIX`
- Keep MQTT credentials and channel secrets in backend env only.
- Use private broker topics and ACLs so only authorized bridge principals can publish/subscribe.

## Notification setup

- Current implementation writes notifications through a local development channel.
- Extension points are present for production Web Push, email, and SMS.
- No real emergency service or real SMS calls are sent by default.

## Scripts

- `npm run dev` - development server
- `npm start` - production server
- `npm run lint` - eslint
- `npm test` - jest/supertest
- `npm run migrate` - run SQL migration (PostgreSQL)
- `npm run seed` - run seed SQL (PostgreSQL)

## Test coverage focus

- Authentication + protected route access
- Server-side authorization/RBAC enforcement
- Geofence boundary/accuracy/freshness behavior
- Alert creation + emergency confirmation + lifecycle transitions

## Deployment guidance

- Use HTTPS/TLS termination.
- Set strong `SESSION_SECRET` and secure cookies.
- Use PostgreSQL with backups.
- Restrict MQTT broker network access and enforce per-topic ACLs.
- Rotate credentials and monitor audit logs.
