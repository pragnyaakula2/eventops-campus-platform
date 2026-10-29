# EventOps: Campus Event Management System

EventOps is a full-stack web application designed to streamline campus event management. It brings event scheduling, venue management, resource allocation, budgeting, student registrations, and multi-stage approvals into one platform.

## Features

- **Role-based access control:** Separate workflows for Admin, Faculty, HOD, Organizer, and Student roles.
- **Event management:** View and manage campus events.
- **Multi-stage approvals:** Faculty, HOD, and Admin approval workflow.
- **Venue management:** Manage campus venues.
- **Resource allocation:** Organize and track event resources.
- **Budget management:** Track event budgets and expenses.
- **Student registrations:** Support event registration workflows.
- **Audit logging:** Record important system and approval actions.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript
- **Backend:** Next.js API routes
- **Database:** PostgreSQL
- **Audit logging:** MongoDB
- **Styling:** CSS

## Getting Started

### Prerequisites

Install the following before running the application:

- Node.js and npm
- PostgreSQL
- MongoDB, if audit logging is enabled

### Installation

Clone the repository:

```bash
git clone https://github.com/pragnyaakula2/eventops-campus-platform.git
cd eventops-campus-platform
npm install
```

### Environment Configuration

Create a `.env.local` file in the project root and configure the environment variables required by the application.

Use the variable names expected by the database and authentication code. Never commit credentials or secret keys to GitHub.

### Database Setup

1. Create the required PostgreSQL database.
2. Apply the project's database schema and any required seed data.
3. Configure the PostgreSQL connection string.
4. Configure MongoDB if you intend to use audit logging.

### Run Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

Run the production build to verify the application:

```bash
npm run build
```

## Project Structure

```text
eventops-campus-platform/
├── app/
│   ├── api/          # Backend API routes
│   ├── approvals/    # Approval workflow
│   ├── budgets/      # Budget management
│   ├── login/        # Authentication interface
│   ├── resources/    # Resource management
│   ├── schedule/     # Event scheduling
│   ├── student/      # Student workflows
│   └── venues/       # Venue management
├── lib/              # Database, authentication and utilities
├── public/           # Static assets
├── package.json
└── README.md
```

## Testing

The production build has been run successfully in the development environment. Authentication and the multi-stage approval workflow have also been tested.

## Future Improvements

- Automated CI checks with GitHub Actions
- Deployment with secure environment configuration
- Expanded automated tests
- Improved reporting and analytics

## License

No license has been specified yet.

