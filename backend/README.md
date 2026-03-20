# MAPO WFM WebApp - Backend

Backend API for Workforce Management (WFM) system built with Node.js, Express, Socket.IO, and native PostgreSQL.

## Features

- 🔐 **JWT Authentication** with RBAC (Role-Based Access Control)
- 📅 **Shift Management** with calendar view and drag-drop support
- ⏰ **Time & Attendance** (Clock-In/Clock-Out)
- 🧠 **WFM Intelligence Engine** for rule validation
- 🔄 **Change Request Workflow** (3-step approval)
- 📊 **Exportable Reports** (text/plain format)
- 🔔 **Real-time Updates** via Socket.IO
- 🛡️ **SQL Injection Protection** with parameterized queries

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL 15 (native driver `pg`)
- **Real-time:** Socket.IO
- **Authentication:** JWT + bcrypt
- **Security:** Helmet, CORS, Rate Limiting

## Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 15 or higher
- Docker (optional, for containerized deployment)

### Installation

```bash
# Clone or navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your database credentials
```

### Database Initialization

```bash
# Option 1: Using npm script
npm run init-db

# Option 2: Using Docker
docker-compose up -d postgres
# The init.sql will run automatically on first startup
```

### Run Development Server

```bash
npm run dev
```

Server will start at `http://localhost:3000`

### Docker Deployment

```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

## Default Credentials

```
Username: admin
Password: admin123
```

⚠️ **Change the admin password immediately after first login!**

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/change-password` | Change password |

### Shifts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shifts/calendar` | Get calendar shifts |
| POST | `/api/shifts` | Create shift |
| POST | `/api/shifts/bulk` | Create multiple shifts |
| PUT | `/api/shifts/:id` | Update shift |
| DELETE | `/api/shifts/:id` | Delete shift |

### Time & Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/punches/clock-in` | Clock in |
| POST | `/api/punches/clock-out` | Clock out |
| GET | `/api/punches/active` | Get active punch |
| GET | `/api/punches` | Get punches by date range |

### Change Requests
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/change-requests/my-requests` | Get my requests |
| POST | `/api/change-requests` | Create request |
| POST | `/api/change-requests/:id/review` | Approve/reject request |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/shifts` | Shift report (text/plain) |
| GET | `/api/reports/attendance` | Attendance report (text/plain) |
| GET | `/api/reports/dashboard` | Dashboard summary (JSON) |

See `current_state.txt` for complete API documentation.

## WFM Intelligence Rules

The system enforces the following rules by default:

| Rule | Default Value |
|------|---------------|
| Max hours per week | 48 hours |
| Max hours per month | 192 hours |
| Max Sundays per month | 3 |
| Min rest days per week | 1 |
| Min rest hours between shifts | 8 hours |

Rules can be customized per user, group, or globally.

## Project Structure

```
backend/
├── database/          # SQL initialization scripts
├── scripts/           # Utility scripts
├── src/
│   ├── config/        # Database configuration
│   ├── controllers/   # Request handlers
│   ├── dao/           # Data Access Objects (SQL queries)
│   ├── middleware/    # Auth, validation, error handling
│   ├── routes/        # API route definitions
│   ├── services/      # Business logic (Socket.IO)
│   ├── utils/         # Utilities (logger, token)
│   └── server.js      # Entry point
├── docker-compose.yml
├── Dockerfile
├── package.json
└── current_state.txt  # Detailed module status
```

## Security Features

- ✅ **SQL Injection Protection:** All queries use parameterized statements
- ✅ **JWT Authentication:** Token-based auth with configurable expiration
- ✅ **RBAC:** Granular permission system
- ✅ **Group Isolation:** Analysts can only access their group data
- ✅ **Password Hashing:** bcrypt with configurable cost factor
- ✅ **Rate Limiting:** Prevents brute force attacks
- ✅ **Helmet:** Security HTTP headers
- ✅ **CORS:** Configurable cross-origin policy
- ✅ **Audit Logging:** All changes tracked

## Socket.IO Events

### Client Events
- `shift:update` - Broadcast shift changes
- `punch:action` - Broadcast punch actions
- `changeRequest:action` - Notify change requests

### Server Events
- `shift:updated` - Shift created/updated/deleted
- `punch:updated` - Punch action occurred
- `changeRequest:notification` - Change request updates
- `user:online` - User online status

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `wfm_db` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `JWT_SECRET` | JWT signing secret | *(required)* |
| `JWT_EXPIRES_IN` | Token expiration | `8h` |
| `BCRYPT_ROUNDS` | Password hash cost | `10` |
| `CORS_ORIGIN` | Allowed origin | `http://localhost:4200` |

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with auto-reload |
| `npm run init-db` | Initialize database schema |
| `npm test` | Run tests |

## License

MIT

## Support

For issues or questions, refer to `current_state.txt` for detailed module documentation or check the API logs.
