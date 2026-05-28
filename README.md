# Team Task Manager (Full-Stack)

A full-stack team task management platform with role-based access, Kanban workflow, activity logs, attachments, overdue alerts, and a rich analytics dashboard.

## Tech Stack
- Frontend: React + Vite + React Router + Axios
- Backend: Node.js + Express + Mongoose
- Database: MongoDB
- Auth: JWT (Bearer token)

## Main Features
- Authentication: signup, login, current user profile
- Role-based access:
  - `ADMIN`: create projects, add/remove members, create/reassign tasks, trigger overdue emails
  - `MEMBER`: access assigned projects and update own task status
- Task management:
  - status (`TODO`, `IN_PROGRESS`, `DONE`), priority, start date, due date
  - file attachments per task
  - Kanban drag-and-drop in project details
  - search + filters
- Dashboard:
  - project KPI cards, project health, workload, recent activity
  - interactive donut chart
  - upcoming deadlines grouped by project
  - scrollable recently-updated tasks list
- Activity logs:
  - task created/updated/status changed
  - attachment add/remove logs
- Overdue notifications:
  - SMTP-based email reminders
  - optional scheduler + manual trigger

## Database Design (MongoDB)
Collections used:
- `users`
- `projects`
- `projectmembers`
- `tasks`
- `activitylogs`

Relationships:
- One `User` owns many `Project`s
- Many `User`s belong to many `Project`s through `ProjectMember`
- One `Project` has many `Task`s
- One `Task` has one assignee (`User`) and one creator (`User`)
- `ActivityLog` tracks who changed what on tasks/projects

## Run Whole Project At Once

From project root:

```bash
npm install
npm run seed --prefix server
npm run dev
```

App URLs:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000/api`

## Environment Setup

### Server (`server/.env`)
Copy from `server/.env.example` and set values:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/team_task_manager
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-strong-secret
JWT_EXPIRES_IN=7d

# Optional: overdue email notifications
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Team Task Manager <no-reply@example.com>
OVERDUE_NOTIFIER_INTERVAL_MINUTES=0
```

### Client (`client/.env`)
Copy from `client/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

## DB Setup Options

### Option A: Local MongoDB
1. Install MongoDB Community Server
2. Ensure MongoDB service is running
3. Use:
   - `MONGODB_URI=mongodb://127.0.0.1:27017/team_task_manager`
4. Run:
   - `npm run seed --prefix server`

### Option B: MongoDB Atlas
1. Create Atlas cluster
2. Create DB user + allow your IP in Network Access
3. Copy connection string to `MONGODB_URI`
4. Run:
   - `npm run seed --prefix server`

## Demo Accounts (after seed)
- Admin: `admin@teamtask.com` / `Admin@123`
- Member: `member@teamtask.com` / `Member@123`

## API Overview
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users/members`
- `POST /api/projects` (admin)
- `GET /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/activity`
- `POST /api/projects/:projectId/members` (admin)
- `DELETE /api/projects/:projectId/members/:userId` (admin)
- `POST /api/projects/:projectId/tasks` (admin)
- `GET /api/projects/:projectId/tasks`
- `PATCH /api/tasks/:taskId`
- `POST /api/tasks/:taskId/attachments`
- `DELETE /api/tasks/:taskId/attachments/:attachmentId`
- `POST /api/tasks/notify-overdue` (admin)
- `GET /api/dashboard`
- `GET /api/health`

## Build
```bash
npm run build --prefix client
```

## Deployment (Railway)
1. Push repository to GitHub
2. Create Railway project from GitHub repo
3. Set server environment variables:

https://github.com/user-attachments/assets/a1943d83-188f-43c8-8546-a05ba6b0f09d



https://github.com/user-attachments/assets/d74a727f-77bd-4e62-8ef9-3d0d3a8c4f28








   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN=7d`
   - `CLIENT_URL=<your-app-url>`
   - `NODE_ENV=production`
   - optional SMTP vars if using overdue emails
4. Railway commands (already configured):
   - Build: `npm run railway:build`
   - Start: `npm run railway:start`


## Submission Placeholders
- Live URL: https://resonant-zuccutto-32b427.netlify.app/login







  
