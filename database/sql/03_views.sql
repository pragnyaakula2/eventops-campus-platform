-- =====================================================================
-- EventOps: College Event Operations and Resource Management System
-- File    : database/views.sql   (Phase 2: Reporting & Dashboard Views)
-- Target  : PostgreSQL 14+
-- Run     : psql -d eventops -f database/views.sql
-- =====================================================================

DROP VIEW IF EXISTS vw_resource_availability_summary CASCADE;
DROP VIEW IF EXISTS vw_student_event_history CASCADE;
DROP VIEW IF EXISTS vw_pending_approvals_chain CASCADE;
DROP VIEW IF EXISTS vw_venue_utilization_calendar CASCADE;
DROP VIEW IF EXISTS vw_budget_utilization CASCADE;
DROP VIEW IF EXISTS vw_event_occupancy CASCADE;

-- ---------------------------------------------------------------------
-- 1. Event Occupancy and Registration Summary
-- Calculates confirmed registrations vs capacity vs waitlist counts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_event_occupancy AS
SELECT
    e.event_id,
    e.title AS event_title,
    e.status AS event_status,
    e.start_time,
    e.end_time,
    c.club_name,
    ec.category_name,
    u.full_name AS organizer_name,
    COALESCE(STRING_AGG(DISTINCT v.venue_name, ', '), 'No Venue Assigned') AS venue_names,
    e.capacity,
    COALESCE(r.confirmed_registrations, 0) AS confirmed_registrations,
    COALESCE(w.waitlist_count, 0) AS waitlist_count,
    e.capacity - COALESCE(r.confirmed_registrations, 0) AS seats_remaining,
    ROUND(
        (COALESCE(r.confirmed_registrations, 0)::NUMERIC / NULLIF(e.capacity, 0)) * 100,
        2
    ) AS occupancy_percentage,
    CASE
        WHEN COALESCE(r.confirmed_registrations, 0) >= e.capacity THEN TRUE
        ELSE FALSE
    END AS is_full
FROM events e
LEFT JOIN clubs c ON e.club_id = c.club_id
LEFT JOIN event_categories ec ON e.category_id = ec.category_id
JOIN users u ON e.organizer_id = u.user_id
LEFT JOIN venue_bookings vb ON e.event_id = vb.event_id AND vb.status = 'Confirmed'
LEFT JOIN venues v ON vb.venue_id = v.venue_id
LEFT JOIN (
    SELECT event_id, COUNT(*) AS confirmed_registrations
    FROM registrations
    WHERE status = 'Registered'
    GROUP BY event_id
) r ON e.event_id = r.event_id
LEFT JOIN (
    SELECT event_id, COUNT(*) AS waitlist_count
    FROM waitlist
    GROUP BY event_id
) w ON e.event_id = w.event_id
GROUP BY
    e.event_id, e.title, e.status, e.start_time, e.end_time,
    c.club_name, ec.category_name, u.full_name, e.capacity,
    r.confirmed_registrations, w.waitlist_count;

-- ---------------------------------------------------------------------
-- 2. Budget and Expense Financial Oversight View
-- Displays allocated budget, actual spend, balance, and sponsorships.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_budget_utilization AS
SELECT
    e.event_id,
    e.title AS event_title,
    e.status AS event_status,
    b.budget_id,
    b.status AS budget_status,
    COALESCE(b.allocated_amount, 0.00) AS allocated_budget,
    COALESCE(exp.total_expenses, 0.00) AS total_expenses,
    COALESCE(b.allocated_amount, 0.00) - COALESCE(exp.total_expenses, 0.00) AS remaining_balance,
    CASE
        WHEN COALESCE(b.allocated_amount, 0) > 0
        THEN ROUND((COALESCE(exp.total_expenses, 0.00) / b.allocated_amount) * 100, 2)
        ELSE 0.00
    END AS budget_utilization_pct,
    COALESCE(spons.total_sponsorship, 0.00) AS total_sponsorship,
    (COALESCE(exp.total_expenses, 0.00) - COALESCE(spons.total_sponsorship, 0.00)) AS net_cost_to_college
FROM events e
LEFT JOIN budgets b ON e.event_id = b.event_id
LEFT JOIN (
    SELECT budget_id, SUM(amount) AS total_expenses
    FROM expenses
    GROUP BY budget_id
) exp ON b.budget_id = exp.budget_id
LEFT JOIN (
    SELECT event_id, SUM(amount) AS total_sponsorship
    FROM sponsorships
    GROUP BY event_id
) spons ON e.event_id = spons.event_id;

-- ---------------------------------------------------------------------
-- 3. Venue Utilization and Schedule Matrix
-- Shows confirmed and cancelled booking slots with durations.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_venue_utilization_calendar AS
SELECT
    vb.booking_id,
    v.venue_id,
    v.venue_name,
    v.building,
    v.capacity AS venue_capacity,
    e.event_id,
    e.title AS event_title,
    e.status AS event_status,
    vb.status AS booking_status,
    lower(vb.booking_period) AS start_time,
    upper(vb.booking_period) AS end_time,
    ROUND(EXTRACT(EPOCH FROM (upper(vb.booking_period) - lower(vb.booking_period))) / 3600.0, 2) AS duration_hours,
    vb.created_at AS booked_at
FROM venue_bookings vb
JOIN venues v ON vb.venue_id = v.venue_id
JOIN events e ON vb.event_id = e.event_id;

-- ---------------------------------------------------------------------
-- 4. Multi-Stage Approval Pipeline View
-- Flattens Faculty -> HOD -> Admin status per event.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_pending_approvals_chain AS
SELECT
    e.event_id,
    e.title AS event_title,
    e.status AS current_event_status,
    u.full_name AS organizer_name,
    c.club_name,
    e.start_time,
    e.end_time,

    -- Faculty stage
    af.status AS faculty_status,
    uf.full_name AS faculty_approver,
    af.decided_at AS faculty_decided_at,
    af.remarks AS faculty_remarks,

    -- HOD stage
    ah.status AS hod_status,
    uh.full_name AS hod_approver,
    ah.decided_at AS hod_decided_at,
    ah.remarks AS hod_remarks,

    -- Admin stage
    aa.status AS admin_status,
    ua.full_name AS admin_approver,
    aa.decided_at AS admin_decided_at,
    aa.remarks AS admin_remarks,

    -- Next expected pending stage in chain
    CASE
        WHEN af.status = 'Pending' OR af.status IS NULL THEN 'Faculty'
        WHEN af.status = 'Approved' AND (ah.status = 'Pending' OR ah.status IS NULL) THEN 'HOD'
        WHEN af.status = 'Approved' AND ah.status = 'Approved' AND (aa.status = 'Pending' OR aa.status IS NULL) THEN 'Admin'
        WHEN af.status = 'Approved' AND ah.status = 'Approved' AND aa.status = 'Approved' THEN 'Completed'
        ELSE 'Halted / Rejected'
    END AS current_stage_in_pipeline
FROM events e
JOIN users u ON e.organizer_id = u.user_id
LEFT JOIN clubs c ON e.club_id = c.club_id
LEFT JOIN approvals af ON e.event_id = af.event_id AND af.stage = 'Faculty'
LEFT JOIN users uf ON af.approver_id = uf.user_id
LEFT JOIN approvals ah ON e.event_id = ah.event_id AND ah.stage = 'HOD'
LEFT JOIN users uh ON ah.approver_id = uh.user_id
LEFT JOIN approvals aa ON e.event_id = aa.event_id AND aa.stage = 'Admin'
LEFT JOIN users ua ON aa.approver_id = ua.user_id;

-- ---------------------------------------------------------------------
-- 5. Student Event Participation & Attendance History
-- Detailed record of events registered, waitlisted, and attended.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_student_event_history AS
SELECT
    u.user_id AS student_id,
    u.full_name AS student_name,
    u.email AS student_email,
    d.dept_name AS student_department,
    e.event_id,
    e.title AS event_title,
    ec.category_name,
    e.start_time,
    e.end_time,
    e.status AS event_status,
    r.registration_id,
    r.status AS registration_status,
    r.registered_at,
    att.attendance_id,
    att.check_in_time,
    att.method AS check_in_method,
    CASE
        WHEN att.attendance_id IS NOT NULL THEN TRUE
        ELSE FALSE
    END AS was_present,
    w.queue_position AS waitlist_position
FROM users u
LEFT JOIN departments d ON u.dept_id = d.dept_id
LEFT JOIN registrations r ON u.user_id = r.student_id
LEFT JOIN events e ON r.event_id = e.event_id
LEFT JOIN event_categories ec ON e.category_id = ec.category_id
LEFT JOIN attendance att ON r.registration_id = att.registration_id
LEFT JOIN waitlist w ON u.user_id = w.student_id AND (e.event_id = w.event_id OR e.event_id IS NULL)
WHERE u.role_id = 5; -- Students only

-- ---------------------------------------------------------------------
-- 6. Resource Equipment Inventory & Maintenance Status
-- Tracks available quantity, active allocations, and maintenance alerts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_resource_availability_summary AS
SELECT
    r.resource_id,
    r.resource_name,
    r.resource_type,
    r.total_quantity,
    r.available_quantity,
    COALESCE(alloc.active_allocated_quantity, 0) AS currently_allocated_quantity,
    r.condition_status,
    COALESCE(maint.unresolved_maintenance_issues, 0) AS active_maintenance_logs
FROM resources r
LEFT JOIN (
    SELECT resource_id, SUM(quantity) AS active_allocated_quantity
    FROM resource_allocations
    WHERE status = 'Allocated'
    GROUP BY resource_id
) alloc ON r.resource_id = alloc.resource_id
LEFT JOIN (
    SELECT resource_id, COUNT(*) AS unresolved_maintenance_issues
    FROM maintenance_logs
    WHERE resolved_on IS NULL
    GROUP BY resource_id
) maint ON r.resource_id = maint.resource_id;
