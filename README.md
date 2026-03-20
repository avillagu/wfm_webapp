# 🏆 MAPO WFM WEBAPP - ONE-CLICK DEVELOPMENT STARTUP

## 🏁 OVERVIEW
This Workforce Management (WFM) application is a containerized stack built for corporate environments. It follows a "one-click" design pattern so the Director or any stakeholder can examine and test the full system without complex local installations.

### 🏛️ ARCHITECTURE
- **FRONTEND**: Angular v17.3.0 (Standalone Component architecture)
- **BACKEND**: Node.js + Express (Service-based architecture)
- **DATABASE**: PostgreSQL 15 (Native `pg` driver, no ORM)
- **REAL-TIME**: Socket.IO for live calendar synchronization

---

## 🚀 ONE-CLICK START (WINDOWS)
1. **PREREQUISITE**: Ensure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is installed and running.
2. **ACTION**: Double-click `start_project.bat`.
3. **RESULT**: 
   - Docker pulls and builds images automatically.
   - PostgreSQL launches and executes `init.sql` to seed the database.
   - Backend API connects to the DB and starts listening.
   - Frontend compiles and serves at **`http://localhost:4200`**.
   - Your default browser will open automatically.

---

## 🐳 SERVICES & PORTS
| Service    | Port   | Internal URL | Description                 |
|------------|--------|--------------|-----------------------------|
| Frontend   | 4200   | http://localhost:4200 | Angular App (Dev Mode)     |
| Backend    | 3000   | http://localhost:3000 | Node API / WebSockets      |
| Database   | 5432   | postgres:5432 (inside) | PostgreSQL (Mapped to Host)|

---

## 🛠️ TROUBLESHOOTING
- **Check Logs**: If something isn't working, open your terminal and run:
  ```bash
  docker-compose logs -f
  ```
- **Port Conflicts**: Ensure ports **`5432`**, **`3000`**, and **`4200`** are not occupied.
  - Common case: Local Postgres running on 5432.
- **Force Rebuild**: If code changes aren't reflecting:
  ```bash
  docker-compose up --build
  ```
- **Stop Everything**:
  ```bash
  docker-compose down
  ```
- **Clean State**: To wipe the database and start fresh:
  ```bash
  docker-compose down -v
  ```

---

## ⚙️ CONFIGURATION
Environment variables are handled via `docker-compose.yml`. You can also create a `.env` file in the root directory if you need to override values.

### 🔐 DATABASE AUTOMATION
The database is initialized by `backend/database/init.sql`. This ensures all tables (Punches, Shifts, Changes) and initial seeds are present on the first run.

---
**MAPO Project - 2026**
