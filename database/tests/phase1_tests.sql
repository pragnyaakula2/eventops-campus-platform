-- =====================================================================
-- EventOps: constraint tests (Phase 1)
-- File : database/tests.sql
-- Run  : psql -d eventops -f database/tests.sql   (after schema.sql and seed.sql)
-- Each test tries something the database must refuse and prints PASS or FAIL.
-- Nothing is saved: every test is undone, so you can run this any time.
-- =====================================================================
SET client_min_messages = NOTICE;

-- T1: two confirmed bookings of the same venue at overlapping times
DO $$ BEGIN
  BEGIN
    INSERT INTO venue_bookings (event_id, venue_id, booking_period)
    VALUES (10, 2, tstzrange(date_trunc('day', now()) + INTERVAL '7 days 11 hours',
                             date_trunc('day', now()) + INTERVAL '7 days 12 hours'));
    RAISE NOTICE 'FAIL  T1 double booking was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN exclusion_violation THEN RAISE NOTICE 'PASS  T1 double booking rejected (exclusion constraint)';
    WHEN raise_exception     THEN NULL;
  END;
END $$;

-- T2: a booking next to an existing one (back to back) must be allowed
DO $$ BEGIN
  BEGIN
    INSERT INTO venue_bookings (event_id, venue_id, booking_period)
    VALUES (10, 2, tstzrange(date_trunc('day', now()) + INTERVAL '7 days 13 hours',
                             date_trunc('day', now()) + INTERVAL '7 days 15 hours'));
    RAISE NOTICE 'PASS  T2 back to back booking allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN exclusion_violation THEN RAISE NOTICE 'FAIL  T2 back to back booking was rejected';
    WHEN raise_exception     THEN NULL;
  END;
END $$;

-- T3: a cancelled booking must not block the slot (event 12 holds a cancelled booking in venue 2)
DO $$ BEGIN
  BEGIN
    INSERT INTO venue_bookings (event_id, venue_id, booking_period)
    VALUES (10, 2, tstzrange(date_trunc('day', now()) + INTERVAL '5 days 16 hours',
                             date_trunc('day', now()) + INTERVAL '5 days 18 hours'));
    RAISE NOTICE 'PASS  T3 slot of a cancelled booking can be reused';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN exclusion_violation THEN RAISE NOTICE 'FAIL  T3 cancelled booking still blocks the slot';
    WHEN raise_exception     THEN NULL;
  END;
END $$;

-- T4: event that ends before it starts
DO $$ BEGIN
  BEGIN
    INSERT INTO events (organizer_id, title, start_time, end_time, capacity)
    VALUES (6, 'Bad times', now() + INTERVAL '2 days', now() + INTERVAL '1 day', 50);
    RAISE NOTICE 'FAIL  T4 end before start was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'PASS  T4 end time before start time rejected (CHECK)';
    WHEN raise_exception THEN NULL;
  END;
END $$;

-- T5: event with zero capacity
DO $$ BEGIN
  BEGIN
    INSERT INTO events (organizer_id, title, start_time, end_time, capacity)
    VALUES (6, 'No seats', now() + INTERVAL '1 day', now() + INTERVAL '2 days', 0);
    RAISE NOTICE 'FAIL  T5 zero capacity was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'PASS  T5 zero capacity rejected (CHECK)';
    WHEN raise_exception THEN NULL;
  END;
END $$;

-- T6: the same student registering twice for one event
DO $$ BEGIN
  BEGIN
    INSERT INTO registrations (event_id, student_id) VALUES (5, 10);
    RAISE NOTICE 'FAIL  T6 duplicate registration was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN unique_violation THEN RAISE NOTICE 'PASS  T6 duplicate registration rejected (UNIQUE)';
    WHEN raise_exception  THEN NULL;
  END;
END $$;

-- T7: negative expense amount
DO $$ BEGIN
  BEGIN
    INSERT INTO expenses (budget_id, description, amount) VALUES (5, 'Refund glitch', -100);
    RAISE NOTICE 'FAIL  T7 negative expense was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'PASS  T7 negative expense rejected (CHECK)';
    WHEN raise_exception THEN NULL;
  END;
END $$;

-- T8: invalid email format
DO $$ BEGIN
  BEGIN
    INSERT INTO users (role_id, full_name, email, password_hash) VALUES (5, 'Bad Email', 'not-an-email', 'x');
    RAISE NOTICE 'FAIL  T8 invalid email was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'PASS  T8 invalid email rejected (CHECK with regex)';
    WHEN raise_exception THEN NULL;
  END;
END $$;

-- T9: duplicate email
DO $$ BEGIN
  BEGIN
    INSERT INTO users (role_id, full_name, email, password_hash) VALUES (5, 'Copy Cat', 'student1@eventops.edu', 'x');
    RAISE NOTICE 'FAIL  T9 duplicate email was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN unique_violation THEN RAISE NOTICE 'PASS  T9 duplicate email rejected (UNIQUE)';
    WHEN raise_exception  THEN NULL;
  END;
END $$;

-- T10: more resources available than the total owned
DO $$ BEGIN
  BEGIN
    UPDATE resources SET available_quantity = total_quantity + 1 WHERE resource_id = 1;
    RAISE NOTICE 'FAIL  T10 available above total was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'PASS  T10 available above total rejected (CHECK)';
    WHEN raise_exception THEN NULL;
  END;
END $$;

-- T11: a registration for an event that does not exist
DO $$ BEGIN
  BEGIN
    INSERT INTO registrations (event_id, student_id) VALUES (9999, 10);
    RAISE NOTICE 'FAIL  T11 registration for missing event was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN foreign_key_violation THEN RAISE NOTICE 'PASS  T11 missing event rejected (FOREIGN KEY)';
    WHEN raise_exception       THEN NULL;
  END;
END $$;

-- T12: a decided approval must carry a decision time
DO $$ BEGIN
  BEGIN
    UPDATE approvals SET status = 'Approved', decided_at = NULL WHERE event_id = 9 AND stage = 'HOD';
    RAISE NOTICE 'FAIL  T12 decision without timestamp was allowed';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'PASS  T12 approval without decision time rejected (CHECK)';
    WHEN raise_exception THEN NULL;
  END;
END $$;

-- T13: a user cannot be removed while still organizing events (ON DELETE RESTRICT)
DO $$ BEGIN
  BEGIN
    DELETE FROM users WHERE user_id = 6;
    RAISE NOTICE 'FAIL  T13 organizer with events was deleted';
    RAISE EXCEPTION 'undo';
  EXCEPTION
    WHEN foreign_key_violation THEN RAISE NOTICE 'PASS  T13 organizer with events cannot be deleted (RESTRICT)';
    WHEN raise_exception       THEN NULL;
  END;
END $$;
