# EventOps: Campus Event Management System

EventOps is a full-stack web application designed to streamline and centralize campus event management. It provides a unified platform for managing event scheduling, venue bookings, resource allocation, budgeting, student registrations, and multi-stage approvals.

The system uses role-based access control to support different campus stakeholders, including administrators, faculty members, Heads of Departments (HODs), event organizers, and students.

**Live Application:** https://eventops-campus-platform.vercel.app

---

## Features

### 1. Role-Based Access Control
- Separate access levels for Admin, Faculty, HOD, Organizer, and Student roles.
- Authentication through a login system.
- Role-based workflows for campus operations.

### 2. Event Management
- View campus events and their details.
- Track event schedules, categories, venues, and registration counts.
- Search and filter events based on relevant information.

### 3. Multi-Stage Approval Workflow
- Structured approval process involving Faculty, HOD, and Admin.
- Track approval statuses.
- Maintain approval records.

### 4. Venue Management
- Manage campus venues.
- Track venue bookings and availability information.

### 5. Resource Management
- Manage resources required for campus events.
- Track resource allocations.

### 6. Budget Management
- Manage event budgets.
- Track expenses and budget-related information.

### 7. Student Registrations
- Support student registration for campus events.
- Track registrations and registration statuses.
- View individual student registration information.

### 8. Audit Logging
- Record important system activities and approval-related actions.
- Use MongoDB for audit logging.

---

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend | Next.js API Routes |
| Styling | Tailwind CSS |
| Relational Database | PostgreSQL |
| Audit Logging | MongoDB |
| Authentication | Session-based authentication |
| Version Control | Git and GitHub |
| CI/CD | GitHub Actions |
| Deployment | Vercel |

---

## Project Architecture

EventOps follows a full-stack architecture in which the Next.js application handles the frontend and backend API functionality.

- **Frontend:** Provides the user interface for event management and campus operations.
- **Backend:** Handles authentication, event operations, registrations, approvals, budgeting, and resource management through API routes.
- **PostgreSQL:** Stores structured application data, including users, events, registrations, approvals, and related records.
- **MongoDB:** Stores audit log information.
- **GitHub Actions:** Automates linting and production build verification.
- **Vercel:** Hosts the production application.

---

## Getting Started

### Prerequisites

Install the following before running the application locally:

- Node.js
- npm
- PostgreSQL
- MongoDB (if audit logging is enabled)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/pragnyaakula2/eventops-campus-platform.git

cd eventops-campus-platform
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env.local` file in the project root.

Configure the environment variables required by the application, including database connection strings and authentication-related secrets.

Use the variable names expected by the application's source code.

**Important:** Never commit `.env.local`, database credentials, authentication secrets, or other sensitive configuration values to GitHub.

### 4. Database Setup

EventOps uses PostgreSQL for structured application data and MongoDB for audit logging.

1. Create and configure the PostgreSQL database.
2. Configure the PostgreSQL connection string.
3. Apply the required database schema and migrations.
4. Execute the appropriate seed scripts if sample data is required.
5. Configure MongoDB if audit logging is enabled.

The project includes database scripts for migration and development seeding.

Available npm scripts:

```bash
npm run db:migrate
npm run db:status
npm run db:seed:dev
```

### 5. Run the Development Server

```bash
npm run dev
```

Open the application in your browser:

http://localhost:3000

---

## Production Build

To generate an optimized production build:

```bash
npm run build
```

To run the production build locally:

```bash
npm run start
```

---

## CI/CD Pipeline

EventOps uses GitHub Actions to automate code quality checks and production build verification.

The CI workflow is configured to execute when changes are pushed to the repository or pull requests are created.

### Automated Checks

1. Check out the repository.
2. Set up the Node.js environment.
3. Install dependencies using `npm ci`.
4. Run ESLint checks.
5. Execute the Next.js production build.

This helps identify linting and build errors before changes are integrated into the main branch.

Vercel is connected to the GitHub repository to support production deployments when changes are pushed to the configured branch.

---

## Deployment

EventOps is deployed using Vercel.

**Live Application:**  
https://eventops-campus-platform.vercel.app

### Deployment Infrastructure

| Service | Purpose |
|---|---|
| Vercel | Application hosting and deployment |
| GitHub | Source code management |
| GitHub Actions | Automated CI checks |
| PostgreSQL (Neon) | Production relational database |
| MongoDB Atlas | Production audit logging |

Production environment variables and database connection details are configured through the deployment platform rather than stored in the source repository.

---

## Project Structure

```text
eventops-campus-platform/
│
├── app/
│   ├── api/
│   │   ├── approvals/
│   │   ├── auth/
│   │   ├── budgets/
│   │   ├── events/
│   │   ├── resources/
│   │   ├── schedule/
│   │   ├── student/
│   │   └── venues/
│   │
│   ├── approvals/
│   ├── budgets/
│   ├── login/
│   ├── resources/
│   ├── schedule/
│   ├── student/
│   │   └── registrations/
│   ├── venues/
│   │
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── database/
│   ├── scripts/
│   └── sql/
│
├── lib/
│   ├── auth.ts
│   ├── db.ts
│   ├── mongodb.ts
│   └── ...
│
├── public/
│
├── tests/
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

---

## Testing and Verification

The following development and deployment checks have been performed:

- ESLint checks executed successfully.
- TypeScript checks completed as part of the production build.
- Next.js production build completed successfully.
- GitHub Actions CI workflow executed successfully.
- PostgreSQL production database configured and populated with seed data.
- Authentication and logout functionality tested.
- Student registration workflow tested.
- Multi-stage approval workflow tested.
- Production deployment verified through Vercel.

---

## Author

**Akula Pragnya**

**Bhoomika Patil**


