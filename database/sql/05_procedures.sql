-- =====================================================================
-- EventOps: College Event Operations and Resource Management System
-- File    : database/procedures.sql   (Phase 2: Stored Procedures & Functions)
-- Target  : PostgreSQL 14+
-- Run     : psql -d eventops -f database/procedures.sql
-- =====================================================================

DROP FUNCTION IF EXISTS sp_book_venue(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS sp_allocate_budget(INT, INT, NUMERIC);
DROP FUNCTION IF EXISTS sp_record_attendance(INT, INT, attendance_method);
DROP FUNCTION IF EXISTS sp_process_approval(INT, approval_stage, approval_status, INT, TEXT);
DROP FUNCTION IF EXISTS sp_cancel_registration_and_promote(INT, INT);
DROP FUNCTION IF EXISTS sp_register_or_waitlist(INT, INT);

-- ---------------------------------------------------------------------
-- 1. sp_register_or_waitlist
-- Concurrency-safe event registration with automatic waitlist overflow.
-- Uses row-level locking on the event to prevent overselling.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_register_or_waitlist(
    p_event_id   INT,
    p_student_id INT
)
RETURNS TABLE (
    record_id      INT,
    result_type    TEXT,
    message        TEXT,
    queue_position INT
) AS $$
DECLARE
    v_capacity       INT;
    v_status         event_status;
    v_active_regs    INT;
    v_new_reg_id     INT;
    v_next_pos       INT;
    v_waitlist_id    INT;
    v_user_role      SMALLINT;
BEGIN
    -- 1. Validate student exists and is active
    SELECT role_id INTO v_user_role
    FROM users
    WHERE user_id = p_student_id AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student ID % is invalid or inactive.', p_student_id;
    END IF;

    -- 2. Lock event row for atomic capacity check
    SELECT capacity, status
    INTO v_capacity, v_status
    FROM events
    WHERE event_id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event ID % does not exist.', p_event_id;
    END IF;

    IF v_status != 'Approved' THEN
        RAISE EXCEPTION 'Cannot register: event "%" is in status "%" (registrations are only open for Approved events).',
            p_event_id, v_status;
    END IF;

    -- 3. Check for existing registration
    IF EXISTS (
        SELECT 1 FROM registrations
        WHERE event_id = p_event_id AND student_id = p_student_id AND status = 'Registered'
    ) THEN
        RAISE EXCEPTION 'Student % is already registered for event %.', p_student_id, p_event_id;
    END IF;

    -- 4. Check for existing waitlist position
    IF EXISTS (
        SELECT 1 FROM waitlist
        WHERE event_id = p_event_id AND student_id = p_student_id
    ) THEN
        RAISE EXCEPTION 'Student % is already on the waitlist for event %.', p_student_id, p_event_id;
    END IF;

    -- 5. Count active registrations
    SELECT COUNT(*)
    INTO v_active_regs
    FROM registrations
    WHERE event_id = p_event_id AND status = 'Registered';

    -- 6. Allocate seat or place on waitlist
    IF v_active_regs < v_capacity THEN
        -- Re-activate previously cancelled registration if it exists, or insert new
        IF EXISTS (
            SELECT 1 FROM registrations
            WHERE event_id = p_event_id AND student_id = p_student_id AND status = 'Cancelled'
        ) THEN
            UPDATE registrations
            SET status = 'Registered', registered_at = now()
            WHERE event_id = p_event_id AND student_id = p_student_id
            RETURNING registration_id INTO v_new_reg_id;
        ELSE
            INSERT INTO registrations (event_id, student_id, status, registered_at)
            VALUES (p_event_id, p_student_id, 'Registered', now())
            RETURNING registration_id INTO v_new_reg_id;
        END IF;

        RETURN QUERY SELECT
            v_new_reg_id,
            'Registered'::TEXT,
            'Registration confirmed. Seat reserved successfully.'::TEXT,
            NULL::INT;
    ELSE
        -- Event full: put on waitlist
        SELECT COALESCE(MAX(waitlist.queue_position), 0) + 1
        INTO v_next_pos
        FROM waitlist
        WHERE event_id = p_event_id;

        INSERT INTO waitlist (event_id, student_id, queue_position, joined_at)
        VALUES (p_event_id, p_student_id, v_next_pos, now())
        RETURNING waitlist_id INTO v_waitlist_id;

        RETURN QUERY SELECT
            v_waitlist_id,
            'Waitlisted'::TEXT,
            format('Event is full (capacity %s). Placed on waitlist at position #%s.', v_capacity, v_next_pos)::TEXT,
            v_next_pos;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. sp_cancel_registration_and_promote
-- Cancels a registration and promotes the first student on the waitlist
-- into a confirmed registration in a single ACID transaction.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_cancel_registration_and_promote(
    p_event_id   INT,
    p_student_id INT
)
RETURNS TABLE (
    cancelled_student_id INT,
    promoted_student_id  INT,
    message              TEXT
) AS $$
DECLARE
    v_reg_id            INT;
    v_top_waitlist_id   INT;
    v_promoted_student  INT;
    v_promoted_reg_id   INT;
BEGIN
    -- 1. Lock the event row to serialize promotions
    PERFORM 1 FROM events WHERE event_id = p_event_id FOR UPDATE;

    -- 2. Cancel the existing registration
    UPDATE registrations
    SET status = 'Cancelled'
    WHERE event_id = p_event_id
      AND student_id = p_student_id
      AND status = 'Registered'
    RETURNING registration_id INTO v_reg_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active confirmed registration found for student % in event %.',
            p_student_id, p_event_id;
    END IF;

    -- 3. Check for the earliest waitlisted student
    SELECT waitlist_id, student_id
    INTO v_top_waitlist_id, v_promoted_student
    FROM waitlist
    WHERE event_id = p_event_id
    ORDER BY queue_position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF FOUND THEN
        -- Promote waitlisted student to Registered
        IF EXISTS (
            SELECT 1 FROM registrations
            WHERE event_id = p_event_id AND student_id = v_promoted_student
        ) THEN
            UPDATE registrations
            SET status = 'Registered', registered_at = now()
            WHERE event_id = p_event_id AND student_id = v_promoted_student
            RETURNING registration_id INTO v_promoted_reg_id;
        ELSE
            INSERT INTO registrations (event_id, student_id, status, registered_at)
            VALUES (p_event_id, v_promoted_student, 'Registered', now())
            RETURNING registration_id INTO v_promoted_reg_id;
        END IF;

        -- Remove promoted student from waitlist
        DELETE FROM waitlist WHERE waitlist_id = v_top_waitlist_id;

        -- Re-index remaining queue positions
        UPDATE waitlist
        SET queue_position = queue_position - 1
        WHERE event_id = p_event_id;

        RETURN QUERY SELECT
            p_student_id,
            v_promoted_student,
            format('Registration cancelled for student %s. Student %s promoted from waitlist to confirmed registration.',
                   p_student_id, v_promoted_student)::TEXT;
    ELSE
        RETURN QUERY SELECT
            p_student_id,
            NULL::INT,
            format('Registration cancelled for student %s. No waitlisted students to promote.', p_student_id)::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. sp_process_approval
-- Records an approval decision for an event stage (Faculty, HOD, Admin)
-- and leverages the approval trigger to automatically transition event status.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_process_approval(
    p_event_id    INT,
    p_stage       approval_stage,
    p_decision    approval_status,
    p_approver_id INT,
    p_remarks     TEXT DEFAULT NULL
)
RETURNS TABLE (
    out_event_id           INT,
    out_stage              approval_stage,
    out_decision           approval_status,
    resulting_event_status event_status,
    message                TEXT
) AS $$
DECLARE
    v_new_event_status event_status;
BEGIN
    -- 1. Validate approver exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_approver_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Approver ID % is invalid or inactive.', p_approver_id;
    END IF;

    -- 2. Upsert approval decision using table-qualified columns to avoid ambiguity
    INSERT INTO approvals AS a (event_id, approver_id, stage, status, remarks, decided_at)
    VALUES (p_event_id, p_approver_id, p_stage, p_decision, p_remarks, now())
    ON CONFLICT ON CONSTRAINT approvals_event_id_stage_key DO UPDATE
    SET approver_id = EXCLUDED.approver_id,
        status      = EXCLUDED.status,
        remarks     = EXCLUDED.remarks,
        decided_at  = now();

    -- 3. Fetch resulting event status (synced via trigger trg_sync_event_approval_status)
    SELECT status INTO v_new_event_status
    FROM events
    WHERE events.event_id = p_event_id;

    RETURN QUERY SELECT
        p_event_id,
        p_stage,
        p_decision,
        v_new_event_status,
        format('Approval stage "%s" marked as "%s". Overall event status is now "%s".',
               p_stage, p_decision, v_new_event_status)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 4. sp_record_attendance
-- Verifies confirmed registration and marks student check-in with QR or Manual method.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_record_attendance(
    p_event_id   INT,
    p_student_id INT,
    p_method     attendance_method DEFAULT 'QR'
)
RETURNS TABLE (
    attendance_id INT,
    check_in_time TIMESTAMPTZ,
    method        attendance_method,
    message       TEXT
) AS $$
DECLARE
    v_reg_id       INT;
    v_att_id       INT;
    v_checkin_time TIMESTAMPTZ;
BEGIN
    -- Verify registration exists and is confirmed
    SELECT registration_id INTO v_reg_id
    FROM registrations
    WHERE event_id = p_event_id
      AND student_id = p_student_id
      AND status = 'Registered';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot record attendance: Student % does not have a confirmed registration for event %.',
            p_student_id, p_event_id;
    END IF;

    -- Check if already checked in
    IF EXISTS (SELECT 1 FROM attendance WHERE registration_id = v_reg_id) THEN
        RAISE EXCEPTION 'Student % has already checked in for event %.', p_student_id, p_event_id;
    END IF;

    INSERT INTO attendance (registration_id, check_in_time, method)
    VALUES (v_reg_id, now(), p_method)
    RETURNING attendance.attendance_id, attendance.check_in_time
    INTO v_att_id, v_checkin_time;

    RETURN QUERY SELECT
        v_att_id,
        v_checkin_time,
        p_method,
        format('Attendance recorded for student %s via %s.', p_student_id, p_method)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 5. sp_allocate_budget
-- Upserts and approves an event budget limit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_allocate_budget(
    p_event_id         INT,
    p_approver_id      INT,
    p_allocated_amount NUMERIC(12,2)
)
RETURNS INT AS $$
DECLARE
    v_budget_id INT;
BEGIN
    IF p_allocated_amount < 0 THEN
        RAISE EXCEPTION 'Allocated budget amount must be non-negative.';
    END IF;

    INSERT INTO budgets (event_id, approved_by, allocated_amount, status)
    VALUES (p_event_id, p_approver_id, p_allocated_amount, 'Approved')
    ON CONFLICT (event_id) DO UPDATE
    SET approved_by      = EXCLUDED.approved_by,
        allocated_amount = EXCLUDED.allocated_amount,
        status           = 'Approved'
    RETURNING budget_id INTO v_budget_id;

    RETURN v_budget_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 6. sp_book_venue
-- Safely books a venue with start and end times, catching GiST exclusion conflicts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_book_venue(
    p_event_id   INT,
    p_venue_id   INT,
    p_start_time TIMESTAMPTZ,
    p_end_time   TIMESTAMPTZ
)
RETURNS TABLE (
    booking_id INT,
    status     booking_status,
    message    TEXT
) AS $$
DECLARE
    v_booking_id INT;
BEGIN
    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'Booking end time (%) must be strictly after start time (%).', p_end_time, p_start_time;
    END IF;

    -- Check if venue is active
    IF NOT EXISTS (SELECT 1 FROM venues WHERE venue_id = p_venue_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Venue ID % is not active or does not exist.', p_venue_id;
    END IF;

    BEGIN
        INSERT INTO venue_bookings (event_id, venue_id, booking_period, status)
        VALUES (p_event_id, p_venue_id, tstzrange(p_start_time, p_end_time), 'Confirmed')
        RETURNING venue_bookings.booking_id INTO v_booking_id;

        RETURN QUERY SELECT
            v_booking_id,
            'Confirmed'::booking_status,
            'Venue booked successfully.'::TEXT;
    EXCEPTION
        WHEN exclusion_violation THEN
            RAISE EXCEPTION 'Venue booking conflict: Venue % is already reserved by another event during the requested period.', p_venue_id;
    END;
END;
$$ LANGUAGE plpgsql;
