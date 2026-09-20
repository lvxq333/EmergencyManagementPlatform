# Java Backend and Nginx Refactor Design

Date: 2026-06-22

## Goal

Refactor the current risk sensing platform with minimal frontend changes while replacing the Node.js backend with Java APIs. Keep the existing frontend style and page structure. Use MySQL and Redis together for persistence and real-time data, generate clearer API documentation, and rebuild the project locally with Nginx serving the frontend on port 8080 and forwarding API calls to Tomcat/Spring Boot.

## Current Project Context

The project is currently a static HTML frontend plus a Node.js/Express backend:

- `login.html`, `register.html`, `index.html`, `home.html`, and `用户管理控制台.html` provide the frontend UI.
- `server.js` implements authentication, user, role, and permission APIs.
- `db.js` configures MySQL access.
- `用户管理系统MySQL数据库结构.sql` defines the existing user, role, permission, and relation tables.
- `home.html` currently creates region risk values and bottom metric cards with `Math.random()` and stores region values in `localStorage`.

The refactor must preserve the current page look and interaction model. Frontend changes should be limited to API base URL changes and replacing local random risk generation with backend API responses.

## Selected Approach

Use a static frontend served by Nginx and a Java Spring Boot backend running on an internal port:

- Browser accesses `http://localhost:8080`.
- Nginx listens on port `8080`.
- Nginx serves existing static HTML files from the project root.
- Nginx proxies `/api/*` to the Java backend at `http://127.0.0.1:8081`.
- Java backend runs as a Spring Boot application with embedded Tomcat on port `8081`.

This avoids the port conflict where both frontend and Tomcat would try to bind `8080`, while still keeping the public frontend URL at port `8080`.

## Architecture

```text
Browser
  |
  | http://localhost:8080
  v
Nginx :8080
  |-- static files --> project root HTML files
  |
  |-- /api/* -------> Spring Boot embedded Tomcat :8081
                       |
                       |-- MySQL: persistent users, roles, permissions, alerts, snapshots
                       |
                       |-- Redis: latest risk overview, simulated region state, metric cache
```

## Frontend Design

The frontend remains plain HTML, CSS, and JavaScript. No frontend framework migration is included.

Required frontend changes:

- Replace hard-coded `http://localhost:3000/api` values with `/api`.
- Keep existing page styling, layout, colors, cards, charts, and map behavior.
- Keep existing authentication storage keys where feasible. If needed, normalize to `auth_token` and `current_user` while preserving login redirect behavior.
- Update `home.html` so dynamic risk values come from `GET /api/risk/overview` instead of local random generation.
- Keep ECharts rendering logic intact and only change the data source shape where needed.
- Keep the Aliyun Beijing GeoJSON fetch unless a local map asset is added later; localizing the map asset is outside this refactor unless external network access becomes a blocker.

## Backend Design

Create a new Java Spring Boot backend under `backend-java/`.

Main backend modules:

- `auth`: login and register APIs, password hashing, JWT creation.
- `user`: user CRUD, search, status update, user-role assignment.
- `role`: role CRUD and role-permission assignment.
- `permission`: permission list API.
- `risk`: real-time risk overview API and simulated dynamic data generation.
- `common`: API response helpers, error handling, configuration, security utilities.

The Java API should preserve the current response shapes where the frontend already depends on them. This keeps frontend edits small and reduces regression risk.

## API Compatibility

Existing API paths to preserve:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/{id}`
- `DELETE /api/users/{id}`
- `PATCH /api/users/{id}/status`
- `GET /api/roles`
- `POST /api/roles`
- `PUT /api/roles/{id}`
- `DELETE /api/roles/{id}`
- `GET /api/permissions`

New API path:

- `GET /api/risk/overview`

The new risk overview response should include:

- `regions`: list of Beijing district risk values, each with `name`, `value`, `level`, and `statusText`.
- `summary`: counts for low, medium, and high risk.
- `metrics`: bottom card values for methane concentration, pipeline pressure, ground displacement, and ambient temperature.
- `alerts`: current medium and high risk alerts sorted by risk value.
- `timestamp`: server update time.

## MySQL and Redis Responsibilities

MySQL is the source of truth for durable data:

- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `risk_alerts`
- `risk_snapshots`

Redis stores short-lived real-time state:

- Latest region risk values.
- Latest bottom metric values.
- Short-lived risk overview cache.
- Optional login/session related cache if needed later.

Redis keys:

- `risk:regions:latest`
- `risk:metrics:latest`
- `risk:overview:latest`

The Java backend should prefer Redis for real-time risk reads. When Redis is empty, it seeds values from deterministic defaults and then updates Redis. Important alert and snapshot events are written to MySQL so the platform can later support historical review.

## Dynamic Risk Simulation Design

The current frontend uses direct random jumps, which can look noisy. The backend simulation should use smoother, bounded changes:

- Each region keeps its previous value in Redis.
- Normal changes use small bounded drift instead of full re-randomization.
- Medium risk begins at value `80`.
- High risk begins above `150`.
- High-risk regions have a controlled probability of intervention, gradually reducing values instead of instantly resetting most of the time.
- Metrics use realistic ranges:
  - Methane concentration: around `0.65%` to `0.95%`.
  - Pipeline pressure: around `3.45 MPa` to `3.85 MPa`.
  - Ground displacement: around `1.0 mm` to `2.2 mm`.
  - Ambient temperature: around `23.5 C` to `27.5 C`.

The API may compute fresh simulation values on each request. Redis keeps continuity between refreshes.

## Database Migration

The existing SQL should be reorganized into a backend-friendly schema file under `sql/schema.sql` or `backend-java/src/main/resources/schema.sql`.

Add durable risk tables:

- `risk_snapshots`: stores periodic aggregate risk and metric JSON snapshots.
- `risk_alerts`: stores medium/high alert events with region, value, level, status, and timestamps.

Initial role and permission seed data should be idempotent so local rebuilds can be repeated.

## Configuration

Backend configuration should support local defaults:

- Spring Boot port: `8081`.
- MySQL host: `localhost`.
- MySQL port: `3306`.
- MySQL database: `risk_platform_db`.
- Redis host: `localhost`.
- Redis port: `6379`.

Sensitive values should be configurable through environment variables or `application-local.yml`. Hard-coded database passwords should be avoided in committed source.

## Nginx Configuration

Add `nginx/risk-platform.conf` with:

- `listen 8080`.
- Static root pointing to the project root.
- `index login.html index.html`.
- `/api/` proxy to `http://127.0.0.1:8081/api/`.
- Proxy headers for host and client IP.

The local rebuild command sequence should explain how to start MySQL, Redis, Spring Boot, and Nginx.

## Documentation

Generate:

- `docs/api.md`: endpoint documentation with method, path, request body, response body, and notes.
- `docs/deployment.md`: local rebuild instructions for MySQL, Redis, Spring Boot/Tomcat, and Nginx.

## Testing and Verification

Verification should include:

- Java backend build/test command.
- Backend health or API smoke checks.
- Login/register API smoke check where local database is available.
- Risk overview API smoke check.
- Static frontend served from Nginx on `http://localhost:8080`.
- Browser or curl check that `/api/risk/overview` is proxied correctly through Nginx.

If local MySQL or Redis is not running, the final report must state which checks could not run and include the exact failure reason.

## Scope Exclusions

This refactor does not include:

- A frontend framework migration.
- A visual redesign.
- Production-grade RBAC enforcement on every endpoint beyond preserving the current behavior.
- Historical charts or alert review pages.
- Containerization unless needed for local rebuild reliability.
- Replacing the external Beijing map GeoJSON dependency unless it blocks local verification.

## Acceptance Criteria

- Frontend visual style remains unchanged.
- Public frontend URL is `http://localhost:8080`.
- Nginx proxies `/api/*` to Java backend on `8081`.
- Node backend is no longer needed for normal local operation.
- Existing user, role, permission, login, and register flows have Java API equivalents.
- Risk overview data comes from Java backend and uses Redis for continuity.
- MySQL schema includes existing user management tables and new risk snapshot/alert tables.
- API and deployment documentation are present.
- Verification results are reported with actual command evidence.
