-- =====================================================================
-- EventOps: College Event Operations and Resource Management System
-- File    : database/schema.sql   (Phase 1: DDL)
-- Target  : PostgreSQL 14+
-- Run     : psql -d eventops -f database/schema.sql
-- Note    : The pgvector column is added later in database/pgvector.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- lets GiST index plain "=" columns, needed for the booking exclusion constraint
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- bcrypt-compatible password hashing for seed data

-- ---------------------------------------------------------------------
-- 1. Enumerated types (fixed sets of status values)
-- ---------------------------------------------------------------------
CREATE TYPE event_status       AS ENUM ('Draft', 'Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed');
CREATE TYPE booking_status     AS ENUM ('Confirmed', 'Cancelled');
CREATE TYPE allocation_status  AS ENUM ('Allocated', 'Returned', 'Cancelled');
CREATE TYPE registration_status AS ENUM ('Registered', 'Cancelled');
CREATE TYPE budget_status      AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE approval_stage     AS ENUM ('Faculty', 'HOD', 'Admin');
CREATE TYPE approval_status    AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE attendance_method  AS ENUM ('QR', 'Manual');
CREATE TYPE resource_condition AS ENUM ('Good', 'Needs Repair', 'Under Maintenance', 'Retired');

-- ---------------------------------------------------------------------
-- 2. Reference tables
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    role_id    SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE departments (
    dept_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dept_name  VARCHAR(100) NOT NULL UNIQUE,
    hod_name   VARCHAR(100)
);

CREATE TABLE event_categories (
    category_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_name  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE venues (
    venue_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_name  VARCHAR(100) NOT NULL UNIQUE,
    building    VARCHAR(100),
    capacity    INT NOT NULL CHECK (capacity > 0),
    venue_type  VARCHAR(40) NOT NULL DEFAULT 'Hall',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE resources (
    resource_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resource_name       VARCHAR(100) NOT NULL UNIQUE,
    resource_type       VARCHAR(40)  NOT NULL,
    total_quantity      INT NOT NULL CHECK (total_quantity >= 0),
    available_quantity  INT NOT NULL CHECK (available_quantity >= 0),
    condition_status    resource_condition NOT NULL DEFAULT 'Good',
    CONSTRAINT chk_available_le_total CHECK (available_quantity <= total_quantity)
);

CREATE TABLE sponsors (
    sponsor_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sponsor_name   VARCHAR(120) NOT NULL UNIQUE,
    contact_email  VARCHAR(150) CHECK (contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
    phone          VARCHAR(10)  CHECK (phone ~ '^[0-9]{10}$')
);

-- ---------------------------------------------------------------------
-- 3. Users and clubs
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id        SMALLINT NOT NULL REFERENCES roles(role_id)       ON DELETE RESTRICT,
    dept_id        INT      REFERENCES departments(dept_id)          ON DELETE SET NULL,
    full_name      VARCHAR(120) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE
                   CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
    password_hash  TEXT NOT NULL,
    phone          VARCHAR(10) CHECK (phone ~ '^[0-9]{10}$'),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clubs (
    club_id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dept_id             INT REFERENCES departments(dept_id) ON DELETE SET NULL,
    faculty_advisor_id  INT REFERENCES users(user_id)       ON DELETE SET NULL,
    club_name           VARCHAR(100) NOT NULL UNIQUE,
    description         TEXT
);

CREATE TABLE club_members (
    club_id    INT NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    position   VARCHAR(40) NOT NULL DEFAULT 'Member',
    joined_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (club_id, user_id)
);

-- ---------------------------------------------------------------------
-- 4. Events
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    club_id       INT REFERENCES clubs(club_id)                     ON DELETE SET NULL,
    category_id   INT REFERENCES event_categories(category_id)      ON DELETE SET NULL,
    organizer_id  INT NOT NULL REFERENCES users(user_id)            ON DELETE RESTRICT,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    start_time    TIMESTAMPTZ NOT NULL,
    end_time      TIMESTAMPTZ NOT NULL,
    capacity      INT NOT NULL CHECK (capacity > 0),
    status        event_status NOT NULL DEFAULT 'Draft',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_event_times CHECK (end_time > start_time)
);

-- ---------------------------------------------------------------------
-- 5. Venue and resource booking
-- ---------------------------------------------------------------------
CREATE TABLE venue_bookings (
    booking_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    venue_id        INT NOT NULL REFERENCES venues(venue_id) ON DELETE RESTRICT,
    booking_period  TSTZRANGE NOT NULL,
    status          booking_status NOT NULL DEFAULT 'Confirmed',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_period_valid CHECK (NOT isempty(booking_period)
                                       AND lower(booking_period) IS NOT NULL
                                       AND upper(booking_period) IS NOT NULL),
    -- The database itself rejects two confirmed bookings of the same venue with overlapping time.
    CONSTRAINT no_venue_overlap EXCLUDE USING gist
        (venue_id WITH =, booking_period WITH &&)
        WHERE (status = 'Confirmed')
);

CREATE TABLE resource_allocations (
    allocation_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id       INT NOT NULL REFERENCES events(event_id)       ON DELETE CASCADE,
    resource_id    INT NOT NULL REFERENCES resources(resource_id) ON DELETE RESTRICT,
    quantity       INT NOT NULL CHECK (quantity > 0),
    allocated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    status         allocation_status NOT NULL DEFAULT 'Allocated',
    UNIQUE (event_id, resource_id)
);

CREATE TABLE maintenance_logs (
    log_id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resource_id        INT NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
    issue_description  TEXT NOT NULL,
    reported_on        DATE NOT NULL DEFAULT CURRENT_DATE,
    resolved_on        DATE,
    CONSTRAINT chk_resolved_after_reported CHECK (resolved_on IS NULL OR resolved_on >= reported_on)
);

-- ---------------------------------------------------------------------
-- 6. Registration, waitlist, attendance, volunteers
-- ---------------------------------------------------------------------
CREATE TABLE registrations (
    registration_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id         INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    student_id       INT NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    status           registration_status NOT NULL DEFAULT 'Registered',
    registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_registration UNIQUE (event_id, student_id)   -- no duplicate registrations
);

CREATE TABLE waitlist (
    waitlist_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    student_id      INT NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    queue_position  INT NOT NULL CHECK (queue_position > 0),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_waitlist UNIQUE (event_id, student_id)
);

CREATE TABLE attendance (
    attendance_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    registration_id  INT NOT NULL UNIQUE REFERENCES registrations(registration_id) ON DELETE CASCADE,
    check_in_time    TIMESTAMPTZ NOT NULL DEFAULT now(),
    method           attendance_method NOT NULL DEFAULT 'QR'
);

CREATE TABLE volunteer_assignments (
    assignment_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id       INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    user_id        INT NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    task           VARCHAR(100) NOT NULL,
    shift_start    TIMESTAMPTZ NOT NULL,
    shift_end      TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_shift_times CHECK (shift_end > shift_start),
    UNIQUE (event_id, user_id, task)
);

-- ---------------------------------------------------------------------
-- 7. Budget, expenses, sponsorship
-- ---------------------------------------------------------------------
CREATE TABLE budgets (
    budget_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id          INT NOT NULL UNIQUE REFERENCES events(event_id) ON DELETE CASCADE,  -- one budget per event
    approved_by       INT REFERENCES users(user_id) ON DELETE SET NULL,
    allocated_amount  NUMERIC(12,2) NOT NULL CHECK (allocated_amount >= 0),
    status            budget_status NOT NULL DEFAULT 'Pending'
);

CREATE TABLE expenses (
    expense_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    budget_id     INT NOT NULL REFERENCES budgets(budget_id) ON DELETE CASCADE,
    description   VARCHAR(200) NOT NULL,
    amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    expense_date  DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE sponsorships (
    sponsorship_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id          INT NOT NULL REFERENCES events(event_id)     ON DELETE CASCADE,
    sponsor_id        INT NOT NULL REFERENCES sponsors(sponsor_id) ON DELETE RESTRICT,
    amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    sponsorship_type  VARCHAR(40) NOT NULL DEFAULT 'Cash',
    UNIQUE (event_id, sponsor_id)
);

-- ---------------------------------------------------------------------
-- 8. Approval workflow
-- ---------------------------------------------------------------------
CREATE TABLE approvals (
    approval_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id     INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    approver_id  INT REFERENCES users(user_id) ON DELETE SET NULL,
    stage        approval_stage  NOT NULL,
    status       approval_status NOT NULL DEFAULT 'Pending',
    remarks      TEXT,
    decided_at   TIMESTAMPTZ,
    UNIQUE (event_id, stage),                                   -- one decision per stage per event
    CONSTRAINT chk_decision_has_time CHECK (status = 'Pending' OR decided_at IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 9. Indexes (foreign keys and common filters; more come in Phase 2)
-- ---------------------------------------------------------------------
CREATE INDEX idx_users_role            ON users (role_id);
CREATE INDEX idx_users_dept            ON users (dept_id);
CREATE INDEX idx_clubs_dept            ON clubs (dept_id);
CREATE INDEX idx_events_start_time     ON events (start_time);
CREATE INDEX idx_events_status_start   ON events (status, start_time);
CREATE INDEX idx_events_club           ON events (club_id);
CREATE INDEX idx_events_category       ON events (category_id);
CREATE INDEX idx_events_organizer      ON events (organizer_id);
CREATE INDEX idx_bookings_event        ON venue_bookings (event_id);
CREATE INDEX idx_allocations_resource  ON resource_allocations (resource_id);
CREATE INDEX idx_registrations_student ON registrations (student_id);
CREATE INDEX idx_waitlist_event_pos    ON waitlist (event_id, queue_position);
CREATE INDEX idx_volunteers_user       ON volunteer_assignments (user_id);
CREATE INDEX idx_expenses_budget       ON expenses (budget_id);
CREATE INDEX idx_approvals_status      ON approvals (status);
