# Java Backend Nginx Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node.js backend with a Java Spring Boot API, keep the static frontend style unchanged, use MySQL plus Redis for data, and serve the app locally through Nginx on port 8080.

**Architecture:** Existing HTML files stay at the project root and call `/api`. Nginx listens on `8080`, serves static files, and proxies `/api/*` to Spring Boot embedded Tomcat on `8081`. Spring Boot persists user/role/permission and alert data in MySQL while Redis stores live risk simulation state.

**Tech Stack:** Java 17, Spring Boot 3, Maven, Spring JDBC, Spring Data Redis, MySQL, Redis, JWT, BCrypt, Nginx, static HTML/JavaScript.

---

## File Structure

- Create `backend-java/pom.xml`: Java backend dependencies and build config.
- Create `backend-java/src/main/java/com/risk/platform/RiskPlatformApplication.java`: Spring Boot entry point.
- Create `backend-java/src/main/java/com/risk/platform/config/*`: CORS, JDBC, Redis, and app config.
- Create `backend-java/src/main/java/com/risk/platform/auth/*`: login, register, JWT, password hashing.
- Create `backend-java/src/main/java/com/risk/platform/user/*`: user DTOs, repository, service, controller.
- Create `backend-java/src/main/java/com/risk/platform/role/*`: role and permission DTOs, repository, service, controller.
- Create `backend-java/src/main/java/com/risk/platform/risk/*`: risk overview DTOs, simulator, Redis-backed service, controller.
- Create `backend-java/src/main/java/com/risk/platform/common/*`: error response and global exception handling.
- Create `backend-java/src/main/resources/application.yml`: local config with env overrides.
- Create `backend-java/src/main/resources/schema.sql`: MySQL schema and seed data.
- Create `backend-java/src/test/java/com/risk/platform/*`: controller/service tests.
- Modify `login.html`, `register.html`, `用户管理控制台.html`, and `home.html`: change hard-coded API base URLs to `/api` and load risk data from backend.
- Create `nginx/risk-platform.conf`: Nginx static/proxy config.
- Update `docs/接口文档.md` and `docs/foxapi-openapi.json`: keep API docs aligned with implementation.
- Create `docs/deployment.md`: local rebuild instructions.

## Task 1: Backend Project Skeleton and Health Test

**Files:**
- Create: `backend-java/pom.xml`
- Create: `backend-java/src/main/java/com/risk/platform/RiskPlatformApplication.java`
- Create: `backend-java/src/main/java/com/risk/platform/common/ApiExceptionHandler.java`
- Create: `backend-java/src/main/java/com/risk/platform/common/MessageResponse.java`
- Create: `backend-java/src/main/resources/application.yml`
- Test: `backend-java/src/test/java/com/risk/platform/HealthContextTest.java`

- [ ] **Step 1: Write context load test**

Create a Spring Boot test that starts the application context with test-safe datasource and Redis settings.

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn test -Dtest=HealthContextTest` inside `backend-java`.
Expected: FAIL because the Spring Boot project does not exist yet.

- [ ] **Step 3: Add Spring Boot skeleton**

Add Maven project, application entry point, application config, and common error types.

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn test -Dtest=HealthContextTest` inside `backend-java`.
Expected: PASS.

## Task 2: Auth/User/Role APIs with MySQL Repositories

**Files:**
- Create: `backend-java/src/main/java/com/risk/platform/auth/*`
- Create: `backend-java/src/main/java/com/risk/platform/user/*`
- Create: `backend-java/src/main/java/com/risk/platform/role/*`
- Create: `backend-java/src/main/resources/schema.sql`
- Test: `backend-java/src/test/java/com/risk/platform/auth/AuthControllerTest.java`
- Test: `backend-java/src/test/java/com/risk/platform/user/UserControllerTest.java`
- Test: `backend-java/src/test/java/com/risk/platform/role/RoleControllerTest.java`

- [ ] **Step 1: Write controller tests for existing API shapes**

Use MockMvc to verify `/api/auth/login`, `/api/auth/register`, `/api/users`, `/api/roles`, and `/api/permissions` response structures.

- [ ] **Step 2: Run tests to verify they fail**

Run: `mvn test -Dtest=AuthControllerTest,UserControllerTest,RoleControllerTest`.
Expected: FAIL because controllers do not exist.

- [ ] **Step 3: Implement repositories, services, controllers, schema**

Use Spring JDBC, BCrypt, and JWT. Preserve current Node response field names such as `realName`, `roleIds`, `role_name`, `permissionIds`, and `message`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `mvn test -Dtest=AuthControllerTest,UserControllerTest,RoleControllerTest`.
Expected: PASS.

## Task 3: Redis-Backed Risk Overview API

**Files:**
- Create: `backend-java/src/main/java/com/risk/platform/risk/*`
- Test: `backend-java/src/test/java/com/risk/platform/risk/RiskServiceTest.java`
- Test: `backend-java/src/test/java/com/risk/platform/risk/RiskControllerTest.java`

- [ ] **Step 1: Write tests for smooth bounded risk data**

Test that `GET /api/risk/overview` returns `regions`, `summary`, `metrics`, `alerts`, and `timestamp`, and that all region values stay between 0 and 200.

- [ ] **Step 2: Run tests to verify they fail**

Run: `mvn test -Dtest=RiskServiceTest,RiskControllerTest`.
Expected: FAIL because the risk API does not exist.

- [ ] **Step 3: Implement risk simulator and Redis-backed service**

Use Redis when available, fall back to in-memory state in tests or when Redis is unavailable, and write alert/snapshot rows when database tables exist.

- [ ] **Step 4: Run tests to verify they pass**

Run: `mvn test -Dtest=RiskServiceTest,RiskControllerTest`.
Expected: PASS.

## Task 4: Frontend Minimal API Refactor

**Files:**
- Modify: `login.html`
- Modify: `register.html`
- Modify: `用户管理控制台.html`
- Modify: `home.html`

- [ ] **Step 1: Add frontend smoke checks**

Use shell searches to prove hard-coded `localhost:3000` still exists before modification.

- [ ] **Step 2: Replace API base URLs**

Use `/api` in login, register, and user management pages.

- [ ] **Step 3: Refactor risk board data source**

Keep ECharts and layout intact. Replace local `Math.random()` region and metric generation with `fetch('/api/risk/overview')` and render the returned data.

- [ ] **Step 4: Verify no old API base remains**

Run: `rg -n "localhost:3000|Math\\.random\\(\\)" *.html`.
Expected: no `localhost:3000`; no risk-board `Math.random()` remains in `home.html`.

## Task 5: Nginx and Deployment Documentation

**Files:**
- Create: `nginx/risk-platform.conf`
- Create: `docs/deployment.md`
- Modify: `docs/接口文档.md`
- Modify: `docs/foxapi-openapi.json`

- [ ] **Step 1: Write Nginx config**

Create config listening on 8080, serving the project root, and proxying `/api/` to `http://127.0.0.1:8081/api/`.

- [ ] **Step 2: Write Chinese deployment guide**

Document MySQL, Redis, Maven build, Java backend startup, Nginx startup, and FoxAPI import path.

- [ ] **Step 3: Validate docs and config**

Run JSON parse on `docs/foxapi-openapi.json` and Nginx syntax check if local nginx is available.

## Task 6: Full Verification

**Files:**
- All files touched above.

- [ ] **Step 1: Run backend test suite**

Run: `mvn test` inside `backend-java`.
Expected: PASS.

- [ ] **Step 2: Run backend package build**

Run: `mvn package -DskipTests` inside `backend-java`.
Expected: PASS and a jar in `backend-java/target`.

- [ ] **Step 3: Run source checks**

Run: `rg -n "localhost:3000" *.html backend-java docs nginx`.
Expected: no matches except historical docs if explicitly marked as old behavior.

- [ ] **Step 4: Report local rebuild status**

If MySQL, Redis, or Nginx are not running locally, report exactly which live checks could not be completed and why.
