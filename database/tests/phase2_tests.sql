-- =====================================================================
-- EventOps: Phase 2 Advanced SQL Feature Tests
-- File : database/phase2_tests.sql
-- Run  : psql -d eventops -f database/phase2_tests.sql
-- All tests run inside an isolated transaction and rollback cleanly.
-- =====================================================================
SET client_min_messages = NOTICE;

BEGIN;

-- ---------------------------------------------------------------------
-- T1: Trigger prevents budget overspending (Budget 3 has 20,000 left)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    INSERT INTO expenses (budget_id, description, amount) VALUES (3, 'Overspend attempt', 25000);
    RAISE NOTICE 'FAIL  P2_T1 budget overspend was allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%Budget limit exceeded%' THEN
        RAISE NOTICE 'PASS  P2_T1 budget overspend blocked by trigger';
      ELSE
        RAISE NOTICE 'FAIL  P2_T1 unexpected error: %', SQLERRM;
      END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- T2: Trigger blocks allocating unhealthy resource (Resource 6 is Needs Repair)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_allocations (event_id, resource_id, quantity, status)
    VALUES (10, 6, 1, 'Allocated');
    RAISE NOTICE 'FAIL  P2_T2 unhealthy resource allocation was allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%cannot be allocated because its condition is%' THEN
        RAISE NOTICE 'PASS  P2_T2 unhealthy resource allocation blocked by trigger';
      ELSE
        RAISE NOTICE 'FAIL  P2_T2 unexpected error: %', SQLERRM;
      END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- T3: Trigger automatically decrements available quantity on allocation
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_initial INT;
  v_after   INT;
BEGIN
  SELECT available_quantity INTO v_initial FROM resources WHERE resource_id = 1; -- Projector (Good)
  INSERT INTO resource_allocations (event_id, resource_id, quantity, status)
  VALUES (10, 1, 2, 'Allocated');
  SELECT available_quantity INTO v_after FROM resources WHERE resource_id = 1;

  IF v_after = (v_initial - 2) THEN
    RAISE NOTICE 'PASS  P2_T3 available_quantity automatically decremented (initial: %, after: %)', v_initial, v_after;
  ELSE
    RAISE NOTICE 'FAIL  P2_T3 available_quantity not decremented properly (initial: %, after: %)', v_initial, v_after;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- T4: Trigger blocks attendance for cancelled registration
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_cancelled_reg INT;
BEGIN
  SELECT registration_id INTO v_cancelled_reg FROM registrations WHERE status = 'Cancelled' LIMIT 1;
  BEGIN
    INSERT INTO attendance (registration_id, check_in_time, method)
    VALUES (v_cancelled_reg, now(), 'QR');
    RAISE NOTICE 'FAIL  P2_T4 attendance for cancelled registration was allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%Cannot record attendance: registration%' THEN
        RAISE NOTICE 'PASS  P2_T4 attendance for cancelled registration rejected';
      ELSE
        RAISE NOTICE 'FAIL  P2_T4 unexpected error: %', SQLERRM;
      END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- T5: Procedure sp_register_or_waitlist adds to waitlist when event is full
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_res RECORD;
BEGIN
  -- Event 6 has 3 capacity and 3 confirmed registrations
  SELECT * INTO v_res FROM sp_register_or_waitlist(6, 16);
  IF v_res.result_type = 'Waitlisted' AND v_res.queue_position = 3 THEN
    RAISE NOTICE 'PASS  P2_T5 waitlist overflow handled correctly (placed at queue #%)', v_res.queue_position;
  ELSE
    RAISE NOTICE 'FAIL  P2_T5 expected Waitlisted at position 3, got % at %', v_res.result_type, v_res.queue_position;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- T6: Procedure sp_cancel_registration_and_promote promotes #1 waitlist student
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_res RECORD;
  v_promoted_status registration_status;
BEGIN
  -- Cancel student 11's seat in event 6, which should promote student 14
  SELECT * INTO v_res FROM sp_cancel_registration_and_promote(6, 11);
  SELECT status INTO v_promoted_status FROM registrations WHERE event_id = 6 AND student_id = 14;

  IF v_res.promoted_student_id = 14 AND v_promoted_status = 'Registered' THEN
    RAISE NOTICE 'PASS  P2_T6 registration cancellation promoted student % from waitlist', v_res.promoted_student_id;
  ELSE
    RAISE NOTICE 'FAIL  P2_T6 promotion failed, got promoted_id: %, status: %', v_res.promoted_student_id, v_promoted_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- T7: Multi-stage approval triggers event transition to Approved
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_status event_status;
BEGIN
  PERFORM sp_process_approval(8, 'Faculty', 'Approved', 2, 'Approved');
  PERFORM sp_process_approval(8, 'HOD', 'Approved', 4, 'Approved');
  PERFORM sp_process_approval(8, 'Admin', 'Approved', 1, 'Approved');

  SELECT status INTO v_status FROM events WHERE event_id = 8;
  IF v_status = 'Approved' THEN
    RAISE NOTICE 'PASS  P2_T7 event transitioned to Approved upon all 3 stages passing';
  ELSE
    RAISE NOTICE 'FAIL  P2_T7 event status is % (expected Approved)', v_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- T8: Procedure sp_book_venue catches GiST conflict
-- ---------------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    PERFORM sp_book_venue(10, 2, '2026-10-30 11:00:00+05:30', '2026-10-30 12:00:00+05:30');
    RAISE NOTICE 'FAIL  P2_T8 overlapping booking was allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%Venue booking conflict%' THEN
        RAISE NOTICE 'PASS  P2_T8 venue double booking rejected by sp_book_venue';
      ELSE
        RAISE NOTICE 'FAIL  P2_T8 unexpected error: %', SQLERRM;
      END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- T9: View vw_event_occupancy returns correct occupancy stats
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT * INTO v_rec FROM vw_event_occupancy WHERE event_id = 6;
  IF v_rec.capacity = 3 AND v_rec.confirmed_registrations = 3 AND v_rec.is_full = TRUE THEN
    RAISE NOTICE 'PASS  P2_T9 vw_event_occupancy accurately reflects capacity and is_full for Event 6';
  ELSE
    RAISE NOTICE 'FAIL  P2_T9 vw_event_occupancy returned unexpected values for Event 6';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- T10: View vw_budget_utilization returns accurate balance
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT * INTO v_rec FROM vw_budget_utilization WHERE budget_id = 3;
  IF v_rec.allocated_budget = 250000.00 AND v_rec.total_expenses = 230000.00 AND v_rec.remaining_balance = 20000.00 THEN
    RAISE NOTICE 'PASS  P2_T10 vw_budget_utilization accurately calculates budget balance (20,000 remaining)';
  ELSE
    RAISE NOTICE 'FAIL  P2_T10 vw_budget_utilization returned unexpected balance';
  END IF;
END $$;

ROLLBACK;
