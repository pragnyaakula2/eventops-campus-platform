-- =====================================================================
-- EventOps: College Event Operations and Resource Management System
-- File    : database/triggers.sql   (Phase 2: Business Logic Triggers)
-- Target  : PostgreSQL 14+
-- Run     : psql -d eventops -f database/triggers.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Trigger: Prevent Budget Overspending
-- Ensures total expenses never exceed the allocated budget amount,
-- and forbids adding expenses to unapproved budgets.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prevent_budget_overspend()
RETURNS TRIGGER AS $$
DECLARE
    v_allocated_amount NUMERIC(12,2);
    v_budget_status    budget_status;
    v_current_total    NUMERIC(12,2);
BEGIN
    -- Fetch parent budget details
    SELECT allocated_amount, status
    INTO v_allocated_amount, v_budget_status
    FROM budgets
    WHERE budget_id = NEW.budget_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced budget ID % does not exist.', NEW.budget_id;
    END IF;

    IF v_budget_status != 'Approved' THEN
        RAISE EXCEPTION 'Cannot record expense for budget ID % because budget is % (must be Approved).',
            NEW.budget_id, v_budget_status;
    END IF;

    -- Calculate current sum of expenses for this budget (excluding this row if updating)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_current_total
    FROM expenses
    WHERE budget_id = NEW.budget_id
      AND (TG_OP = 'INSERT' OR expense_id != NEW.expense_id);

    IF (v_current_total + NEW.amount) > v_allocated_amount THEN
        RAISE EXCEPTION 'Budget limit exceeded: allocated amount is %, current spend is %, requested expense is % (exceeds balance by %).',
            v_allocated_amount, v_current_total, NEW.amount,
            ((v_current_total + NEW.amount) - v_allocated_amount);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_budget_overspend ON expenses;
CREATE TRIGGER trg_prevent_budget_overspend
    BEFORE INSERT OR UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_budget_overspend();

-- ---------------------------------------------------------------------
-- 2. Trigger: Block Allocation of Unhealthy Resources
-- Forbids allocating resources that are not in 'Good' condition.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_block_unhealthy_resource_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_condition resource_condition;
    v_name      VARCHAR(100);
BEGIN
    -- Check only when new allocation is being made or status updated to Allocated
    IF (TG_OP = 'INSERT' AND NEW.status = 'Allocated') OR
       (TG_OP = 'UPDATE' AND OLD.status != 'Allocated' AND NEW.status = 'Allocated') THEN

        SELECT condition_status, resource_name
        INTO v_condition, v_name
        FROM resources
        WHERE resource_id = NEW.resource_id;

        IF v_condition != 'Good' THEN
            RAISE EXCEPTION 'Resource "%" (ID %) cannot be allocated because its condition is "%" (must be Good).',
                v_name, NEW.resource_id, v_condition;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_unhealthy_resource_allocation ON resource_allocations;
CREATE TRIGGER trg_block_unhealthy_resource_allocation
    BEFORE INSERT OR UPDATE ON resource_allocations
    FOR EACH ROW
    EXECUTE FUNCTION fn_block_unhealthy_resource_allocation();

-- ---------------------------------------------------------------------
-- 3. Trigger: Automatic Resource Inventory Adjustment
-- Automatically updates available_quantity in resources table
-- when allocations are created, returned, or cancelled.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_resource_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_available INT;
    v_total     INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'Allocated' THEN
            SELECT available_quantity, total_quantity
            INTO v_available, v_total
            FROM resources
            WHERE resource_id = NEW.resource_id
            FOR UPDATE;

            IF v_available < NEW.quantity THEN
                RAISE EXCEPTION 'Insufficient resource inventory for ID %: requested %, available %.',
                    NEW.resource_id, NEW.quantity, v_available;
            END IF;

            UPDATE resources
            SET available_quantity = available_quantity - NEW.quantity
            WHERE resource_id = NEW.resource_id;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Status changed from Allocated to Returned or Cancelled
        IF OLD.status = 'Allocated' AND NEW.status IN ('Returned', 'Cancelled') THEN
            UPDATE resources
            SET available_quantity = LEAST(total_quantity, available_quantity + OLD.quantity)
            WHERE resource_id = NEW.resource_id;

        -- Status changed back to Allocated
        ELSIF OLD.status IN ('Returned', 'Cancelled') AND NEW.status = 'Allocated' THEN
            SELECT available_quantity INTO v_available
            FROM resources
            WHERE resource_id = NEW.resource_id
            FOR UPDATE;

            IF v_available < NEW.quantity THEN
                RAISE EXCEPTION 'Insufficient resource inventory to re-allocate: requested %, available %.',
                    NEW.quantity, v_available;
            END IF;

            UPDATE resources
            SET available_quantity = available_quantity - NEW.quantity
            WHERE resource_id = NEW.resource_id;

        -- Quantity changed while remaining Allocated
        ELSIF OLD.status = 'Allocated' AND NEW.status = 'Allocated' AND OLD.quantity != NEW.quantity THEN
            SELECT available_quantity INTO v_available
            FROM resources
            WHERE resource_id = NEW.resource_id
            FOR UPDATE;

            IF (v_available + OLD.quantity) < NEW.quantity THEN
                RAISE EXCEPTION 'Insufficient resource inventory for updated quantity: requested %, available %.',
                    NEW.quantity, (v_available + OLD.quantity);
            END IF;

            UPDATE resources
            SET available_quantity = available_quantity + (OLD.quantity - NEW.quantity)
            WHERE resource_id = NEW.resource_id;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'Allocated' THEN
            UPDATE resources
            SET available_quantity = LEAST(total_quantity, available_quantity + OLD.quantity)
            WHERE resource_id = OLD.resource_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_resource_inventory ON resource_allocations;
CREATE TRIGGER trg_auto_resource_inventory
    AFTER INSERT OR UPDATE OR DELETE ON resource_allocations
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_resource_inventory();

-- ---------------------------------------------------------------------
-- 4. Trigger: Attendance Registration Validation
-- Ensures attendance can only be recorded for students with an
-- active (not cancelled) registration.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_attendance_registration_check()
RETURNS TRIGGER AS $$
DECLARE
    v_status registration_status;
BEGIN
    SELECT status INTO v_status
    FROM registrations
    WHERE registration_id = NEW.registration_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration ID % not found.', NEW.registration_id;
    END IF;

    IF v_status != 'Registered' THEN
        RAISE EXCEPTION 'Cannot record attendance: registration ID % is % (must be Registered).',
            NEW.registration_id, v_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_registration_check ON attendance;
CREATE TRIGGER trg_attendance_registration_check
    BEFORE INSERT ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION fn_attendance_registration_check();

-- ---------------------------------------------------------------------
-- 5. Trigger: Sync Event Approval Status Across Multi-Stage Pipeline
-- When all 3 stages approve, sets event to Approved.
-- When any stage rejects, sets event to Rejected.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_event_approval_status()
RETURNS TRIGGER AS $$
DECLARE
    v_approved_count INT;
BEGIN
    IF NEW.status = 'Rejected' THEN
        UPDATE events
        SET status = 'Rejected'
        WHERE event_id = NEW.event_id AND status != 'Rejected';

    ELSIF NEW.status = 'Approved' THEN
        SELECT COUNT(*)
        INTO v_approved_count
        FROM approvals
        WHERE event_id = NEW.event_id AND status = 'Approved';

        -- If all 3 stages (Faculty, HOD, Admin) have approved
        IF v_approved_count >= 3 THEN
            UPDATE events
            SET status = 'Approved'
            WHERE event_id = NEW.event_id AND status != 'Approved';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_event_approval_status ON approvals;
CREATE TRIGGER trg_sync_event_approval_status
    AFTER UPDATE OF status ON approvals
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_event_approval_status();

-- ---------------------------------------------------------------------
-- 6. Trigger: Auto Release Venue and Resources on Event Cancellation
-- When an event is cancelled, frees up its venue booking and resources.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_release_on_event_cancellation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Cancelled' AND OLD.status != 'Cancelled' THEN
        -- Free venue bookings so the time slots can be booked again
        UPDATE venue_bookings
        SET status = 'Cancelled'
        WHERE event_id = NEW.event_id AND status = 'Confirmed';

        -- Free resource allocations and return inventory
        UPDATE resource_allocations
        SET status = 'Cancelled'
        WHERE event_id = NEW.event_id AND status = 'Allocated';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_on_event_cancellation ON events;
CREATE TRIGGER trg_release_on_event_cancellation
    AFTER UPDATE OF status ON events
    FOR EACH ROW
    EXECUTE FUNCTION fn_release_on_event_cancellation();

-- ---------------------------------------------------------------------
-- 7. Trigger: Sync Resource Condition on Maintenance Log Entry
-- Sets condition to Under Maintenance when reported, and restores to Good
-- when resolved (if no other issues open).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_maintenance_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.resolved_on IS NULL) THEN
        IF NEW.resolved_on IS NULL THEN
            UPDATE resources
            SET condition_status = 'Under Maintenance'
            WHERE resource_id = NEW.resource_id
              AND condition_status = 'Good';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.resolved_on IS NOT NULL AND OLD.resolved_on IS NULL THEN
        -- If no remaining open maintenance logs for this resource
        IF NOT EXISTS (
            SELECT 1 FROM maintenance_logs
            WHERE resource_id = NEW.resource_id AND resolved_on IS NULL AND log_id != NEW.log_id
        ) THEN
            UPDATE resources
            SET condition_status = 'Good'
            WHERE resource_id = NEW.resource_id AND condition_status = 'Under Maintenance';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_maintenance_status ON maintenance_logs;
CREATE TRIGGER trg_sync_maintenance_status
    AFTER INSERT OR UPDATE ON maintenance_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_maintenance_status();
