-- =====================================================================
-- EventOps: sample data for demo and testing
-- File    : database/seed.sql   (Phase 1)
-- Run     : psql -d eventops -f database/seed.sql   (after schema.sql)
-- Safe to re-run: it empties all tables first.
-- All test accounts use the password:  Password@123
-- Dates are relative to the day you run it, so the demo never goes stale.
-- =====================================================================

BEGIN;

TRUNCATE roles, departments, event_categories, venues, resources, sponsors,
         users, clubs, club_members, events, venue_bookings, resource_allocations,
         maintenance_logs, registrations, waitlist, attendance,
         volunteer_assignments, budgets, expenses, sponsorships, approvals
RESTART IDENTITY CASCADE;

-- Helper: midnight today + N days + H hours (exists only for this session)
CREATE FUNCTION pg_temp.at(days INT, hrs NUMERIC) RETURNS TIMESTAMPTZ
LANGUAGE sql AS $$ SELECT date_trunc('day', now()) + days * INTERVAL '1 day' + hrs * INTERVAL '1 hour' $$;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
INSERT INTO roles (role_name) VALUES
 ('Admin'), ('Faculty'), ('HOD'), ('Organizer'), ('Student');            -- ids 1..5

INSERT INTO departments (dept_name, hod_name) VALUES
 ('Computer Science and Engineering', 'Prof. Suresh Kulkarni'),         -- 1
 ('Electronics and Communication',    'Prof. Lakshmi Narayan'),         -- 2
 ('Mechanical Engineering',          'Prof. Anil Verma'),              -- 3
 ('Business Administration',         'Prof. Sunita Joshi'),            -- 4
 ('Biotechnology',                   'Prof. Farhan Sheikh');           -- 5

INSERT INTO event_categories (category_name) VALUES
 ('Technical'), ('Cultural'), ('Workshop'), ('Seminar'), ('Sports'), ('Social Service');  -- 1..6

INSERT INTO venues (venue_name, building, capacity, venue_type) VALUES
 ('Main Auditorium',   'Admin Block',     800,  'Auditorium'),         -- 1
 ('Seminar Hall A',    'CSE Block',       150,  'Hall'),               -- 2
 ('Seminar Hall B',    'ECE Block',       120,  'Hall'),               -- 3
 ('Computer Lab 1',    'CSE Block',        60,  'Lab'),                -- 4
 ('Open Air Theatre',  'Central Campus', 1000,  'Outdoor'),            -- 5
 ('Conference Room',   'Admin Block',      40,  'Meeting Room'),       -- 6
 ('Sports Ground',     'Sports Complex', 2000,  'Outdoor'),            -- 7
 ('Innovation Studio', 'Library',          80,  'Studio');             -- 8

-- available_quantity starts equal to total; it is recomputed from allocations at the end.
INSERT INTO resources (resource_name, resource_type, total_quantity, available_quantity, condition_status) VALUES
 ('Projector',          'Equipment',  12,  12, 'Good'),                -- 1
 ('Wireless Microphone','Equipment',  20,  20, 'Good'),                -- 2
 ('Sound System',       'Equipment',   4,   4, 'Good'),                -- 3
 ('Folding Chair',      'Furniture', 500, 500, 'Good'),                -- 4
 ('Laptop',             'Equipment',  30,  30, 'Good'),                -- 5
 ('Stage Lighting Kit', 'Equipment',   3,   3, 'Needs Repair'),        -- 6
 ('DSLR Camera',        'Equipment',   6,   6, 'Under Maintenance'),   -- 7
 ('Extension Board',    'Equipment',  40,  40, 'Good'),                -- 8
 ('Banner Stand',       'Equipment',  15,  15, 'Good'),                -- 9
 ('Table',              'Furniture',  80,  80, 'Good');                -- 10

INSERT INTO sponsors (sponsor_name, contact_email, phone) VALUES
 ('TechNova Solutions', 'partnerships@technova.example', '9876500001'),   -- 1
 ('GreenLeaf Foods',    'csr@greenleaf.example',         '9876500002'),   -- 2
 ('Bright Future Bank', 'campus@brightbank.example',     '9876500003'),   -- 3
 ('CodeCraft Academy',  'hello@codecraft.example',       '9876500004');   -- 4

-- ---------------------------------------------------------------------
-- Users (password for everyone: Password@123, stored as a bcrypt hash)
-- ---------------------------------------------------------------------
INSERT INTO users (role_id, dept_id, full_name, email, password_hash, phone) VALUES
 (1, NULL, 'Ananya Rao',        'admin@eventops.edu',        crypt('Password@123', gen_salt('bf', 10)), '9000000001'),  -- 1  Admin
 (2, 1,    'Dr. Ravi Menon',    'faculty.cse@eventops.edu',  crypt('Password@123', gen_salt('bf', 10)), '9000000002'),  -- 2  Faculty CSE
 (2, 2,    'Dr. Meera Iyer',    'faculty.ece@eventops.edu',  crypt('Password@123', gen_salt('bf', 10)), '9000000003'),  -- 3  Faculty ECE
 (3, 1,    'Prof. Suresh Kulkarni','hod.cse@eventops.edu',   crypt('Password@123', gen_salt('bf', 10)), '9000000004'),  -- 4  HOD CSE
 (3, 2,    'Prof. Lakshmi Narayan','hod.ece@eventops.edu',   crypt('Password@123', gen_salt('bf', 10)), '9000000005'),  -- 5  HOD ECE
 (4, 1,    'Rohan Shah',        'organizer1@eventops.edu',   crypt('Password@123', gen_salt('bf', 10)), '9000000006'),  -- 6  Organizer (Coding Club)
 (4, 2,    'Priya Nair',        'organizer2@eventops.edu',   crypt('Password@123', gen_salt('bf', 10)), '9000000007'),  -- 7  Organizer (Robotics)
 (4, 4,    'Neha Kapoor',       'organizer3@eventops.edu',   crypt('Password@123', gen_salt('bf', 10)), '9000000008'),  -- 8  Organizer (E-Cell)
 (4, 1,    'Arjun Das',         'organizer4@eventops.edu',   crypt('Password@123', gen_salt('bf', 10)), '9000000009'),  -- 9  Organizer (Cultural)
 (5, 1,    'Aditi Sharma',      'student1@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000001'),  -- 10
 (5, 1,    'Vikram Singh',      'student2@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000002'),  -- 11
 (5, 2,    'Sneha Pillai',      'student3@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000003'),  -- 12
 (5, 2,    'Manish Gupta',      'student4@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000004'),  -- 13
 (5, 4,    'Divya Krishnan',    'student5@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000005'),  -- 14
 (5, 1,    'Sanjay Patel',      'student6@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000006'),  -- 15
 (5, 3,    'Ritika Bose',       'student7@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000007'),  -- 16
 (5, 3,    'Harsh Vardhan',     'student8@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000008'),  -- 17
 (5, 5,    'Ishita Mehta',      'student9@eventops.edu',     crypt('Password@123', gen_salt('bf', 10)), '9100000009'),  -- 18
 (5, 5,    'Kabir Khan',        'student10@eventops.edu',    crypt('Password@123', gen_salt('bf', 10)), '9100000010'),  -- 19
 (5, 1,    'Tanvi Deshmukh',    'student11@eventops.edu',    crypt('Password@123', gen_salt('bf', 10)), '9100000011'),  -- 20
 (5, 2,    'Rahul Menon',       'student12@eventops.edu',    crypt('Password@123', gen_salt('bf', 10)), '9100000012');  -- 21

INSERT INTO clubs (dept_id, faculty_advisor_id, club_name, description) VALUES
 (1, 2, 'Coding Club',           'Hackathons, competitive programming and tech talks.'),          -- 1
 (2, 3, 'Robotics Club',         'Robots, embedded systems and IoT projects.'),                    -- 2
 (4, 2, 'Entrepreneurship Cell', 'Startup pitches, mentoring and founder talks.'),                 -- 3
 (1, 2, 'Cultural Club',         'Music, dance, drama and the annual cultural fest.'),             -- 4
 (3, 3, 'Photography Club',      'Photo walks, exhibitions and editing workshops.'),               -- 5
 (5, 3, 'Green Campus Club',     'Sustainability drives and awareness campaigns.');                -- 6

INSERT INTO club_members (club_id, user_id, position) VALUES
 (1, 6, 'President'), (2, 7, 'President'), (3, 8, 'President'), (4, 9, 'President'),
 (1, 10, 'Member'), (1, 11, 'Secretary'), (2, 12, 'Member'), (2, 13, 'Member'),
 (3, 14, 'Member'), (4, 15, 'Member'), (4, 16, 'Treasurer'), (5, 17, 'Member'),
 (6, 18, 'Member'), (1, 19, 'Member');

-- ---------------------------------------------------------------------
-- Events: 4 completed, 3 approved, 3 pending/draft, 1 cancelled, 1 awaiting approval
-- ---------------------------------------------------------------------
INSERT INTO events (club_id, category_id, organizer_id, title, description, start_time, end_time, capacity, status, created_at) VALUES
 (1, 1, 6, 'CodeSprint 2026 Hackathon',
  'A 24-hour hackathon where teams build web and AI projects around campus problems.',
  pg_temp.at(-40, 9), pg_temp.at(-39, 18), 60, 'Completed', pg_temp.at(-80, 10)),                        -- 1
 (2, 3, 7, 'Robotics Workshop: Line Follower Bots',
  'Hands-on workshop to build and program a line following robot using Arduino and sensors.',
  pg_temp.at(-25, 10), pg_temp.at(-25, 16), 40, 'Completed', pg_temp.at(-60, 10)),                       -- 2
 (4, 2, 9, 'Rhythm 2026 Annual Cultural Fest',
  'Evening of music, dance and drama performances by students from every department.',
  pg_temp.at(-15, 16), pg_temp.at(-15, 22), 700, 'Completed', pg_temp.at(-70, 10)),                      -- 3
 (3, 4, 8, 'Startup Pitch Night',
  'Student founders pitch business ideas to alumni investors and mentors.',
  pg_temp.at(-8, 17), pg_temp.at(-8, 20), 100, 'Completed', pg_temp.at(-45, 10)),                        -- 4
 (1, 4, 6, 'AI for Beginners Seminar',
  'Introductory talk on machine learning and generative AI with live demos for first and second year students.',
  pg_temp.at(7, 10), pg_temp.at(7, 13), 120, 'Approved', pg_temp.at(-20, 10)),                           -- 5
 (2, 3, 7, 'IoT Lab Mini Workshop (limited seats)',
  'Small group workshop on connecting sensors to the cloud. Only three seats because of lab kits.',
  pg_temp.at(10, 14), pg_temp.at(10, 17), 3, 'Approved', pg_temp.at(-18, 10)),                           -- 6
 (NULL, 5, 9, 'Inter-Department Football Cup',
  'Knockout football tournament between all departments, with finals in the evening.',
  pg_temp.at(12, 8), pg_temp.at(12, 18), 500, 'Approved', pg_temp.at(-25, 10)),                          -- 7
 (6, 6, 8, 'Tree Plantation Drive',
  'Campus wide plantation drive with saplings, followed by a short talk on urban green cover.',
  pg_temp.at(14, 7), pg_temp.at(14, 11), 150, 'Pending', pg_temp.at(-10, 10)),                           -- 8
 (5, 3, 9, 'Photography Masterclass',
  'Composition, lighting and mobile photography techniques taught by a professional photographer.',
  pg_temp.at(20, 15), pg_temp.at(20, 18), 50, 'Pending', pg_temp.at(-8, 10)),                            -- 9
 (1, 3, 6, 'Web Development Bootcamp',
  'Two day bootcamp covering HTML, CSS, JavaScript and building a small full stack project.',
  pg_temp.at(21, 10), pg_temp.at(22, 17), 60, 'Draft', pg_temp.at(-2, 10)),                              -- 10
 (NULL, 4, 8, 'Alumni Meet 2026',
  'Annual gathering of alumni with talks, networking dinner and campus tour.',
  pg_temp.at(30, 17), pg_temp.at(30, 21), 600, 'Pending', pg_temp.at(-6, 10)),                           -- 11
 (3, 4, 8, 'Business Quiz Night',
  'Team quiz on business news, brands and startups. Cancelled because it clashed with exams.',
  pg_temp.at(5, 16), pg_temp.at(5, 18), 80, 'Cancelled', pg_temp.at(-15, 10));                           -- 12

-- ---------------------------------------------------------------------
-- Venue bookings (cancelled bookings do not block the slot)
-- ---------------------------------------------------------------------
INSERT INTO venue_bookings (event_id, venue_id, booking_period, status) VALUES
 (1, 4, tstzrange(pg_temp.at(-40, 9),  pg_temp.at(-39, 18)), 'Confirmed'),
 (2, 8, tstzrange(pg_temp.at(-25, 10), pg_temp.at(-25, 16)), 'Confirmed'),
 (3, 1, tstzrange(pg_temp.at(-15, 10), pg_temp.at(-15, 15)), 'Confirmed'),   -- rehearsal in auditorium
 (3, 5, tstzrange(pg_temp.at(-15, 16), pg_temp.at(-15, 22)), 'Confirmed'),
 (4, 2, tstzrange(pg_temp.at(-8, 17),  pg_temp.at(-8, 20)),  'Confirmed'),
 (5, 2, tstzrange(pg_temp.at(7, 10),   pg_temp.at(7, 13)),   'Confirmed'),
 (6, 6, tstzrange(pg_temp.at(10, 14),  pg_temp.at(10, 17)),  'Confirmed'),
 (7, 7, tstzrange(pg_temp.at(12, 8),   pg_temp.at(12, 18)),  'Confirmed'),
 (8, 5, tstzrange(pg_temp.at(14, 7),   pg_temp.at(14, 11)),  'Confirmed'),
 (9, 8, tstzrange(pg_temp.at(20, 15),  pg_temp.at(20, 18)),  'Confirmed'),
 (11, 1, tstzrange(pg_temp.at(30, 17), pg_temp.at(30, 21)),  'Confirmed'),
 (12, 2, tstzrange(pg_temp.at(5, 16),  pg_temp.at(5, 18)),   'Cancelled');

-- ---------------------------------------------------------------------
-- Resource allocations (past events are Returned, upcoming are Allocated)
-- ---------------------------------------------------------------------
INSERT INTO resource_allocations (event_id, resource_id, quantity, status) VALUES
 (1, 5, 20, 'Returned'), (1, 8, 20, 'Returned'),
 (2, 1, 1,  'Returned'), (2, 5, 10, 'Returned'),
 (3, 3, 2,  'Returned'), (3, 2, 8,  'Returned'), (3, 6, 2, 'Returned'), (3, 4, 200, 'Returned'),
 (4, 1, 1,  'Returned'), (4, 2, 2,  'Returned'), (4, 9, 4, 'Returned'),
 (5, 1, 1,  'Allocated'), (5, 2, 2, 'Allocated'),
 (6, 5, 3,  'Allocated'), (6, 8, 6, 'Allocated'),
 (7, 3, 1,  'Allocated'), (7, 9, 8, 'Allocated'), (7, 10, 20, 'Allocated'),
 (8, 9, 5,  'Allocated'), (8, 10, 10, 'Allocated'),
 (9, 7, 2,  'Allocated'),
 (11, 4, 300, 'Allocated'), (11, 1, 2, 'Allocated'), (11, 2, 4, 'Allocated'),
 (11, 3, 2, 'Allocated'), (11, 6, 1, 'Allocated');

-- Make available_quantity match what is currently allocated
UPDATE resources r
SET available_quantity = r.total_quantity - COALESCE((
        SELECT SUM(a.quantity) FROM resource_allocations a
        WHERE a.resource_id = r.resource_id AND a.status = 'Allocated'), 0);

INSERT INTO maintenance_logs (resource_id, issue_description, reported_on, resolved_on) VALUES
 (1, 'Projector lamp replaced after dimming',      CURRENT_DATE - 60, CURRENT_DATE - 58),
 (6, 'Faulty dimmer channel on lighting kit',      CURRENT_DATE - 30, NULL),
 (2, 'Cracked battery compartment on microphone',  CURRENT_DATE - 5,  NULL),
 (7, 'Autofocus not working on two camera lenses', CURRENT_DATE - 10, NULL);

-- ---------------------------------------------------------------------
-- Registrations, waitlist, attendance, volunteers
-- ---------------------------------------------------------------------
INSERT INTO registrations (event_id, student_id, status, registered_at)
SELECT e.event_id, s.user_id, 'Registered',
       e.start_time - INTERVAL '10 days' + (s.user_id * INTERVAL '37 minutes')
FROM events e
JOIN (VALUES (1,10,17), (2,10,14), (3,10,21), (4,14,18), (5,10,19), (6,10,12), (7,10,21), (8,18,21)) AS r(event_id, first_s, last_s)
  ON r.event_id = e.event_id
JOIN users s ON s.user_id BETWEEN r.first_s AND r.last_s;

-- One cancelled registration to show the status
INSERT INTO registrations (event_id, student_id, status, registered_at)
VALUES (5, 20, 'Cancelled', pg_temp.at(-2, 11));

-- Event 6 has 3 seats and all are taken, so two students are on the waitlist
INSERT INTO waitlist (event_id, student_id, queue_position, joined_at) VALUES
 (6, 14, 1, pg_temp.at(-1, 9)),
 (6, 15, 2, pg_temp.at(-1, 10));

-- Check-ins for completed events (most registered students turned up)
INSERT INTO attendance (registration_id, check_in_time, method)
SELECT g.registration_id,
       e.start_time + (g.student_id % 7) * INTERVAL '3 minutes',
       CASE WHEN g.student_id % 3 = 0 THEN 'Manual' ELSE 'QR' END::attendance_method
FROM registrations g
JOIN events e ON e.event_id = g.event_id
WHERE e.status = 'Completed'
  AND g.status = 'Registered'
  AND g.student_id % 5 <> 4;   -- every fifth student is a no-show

INSERT INTO volunteer_assignments (event_id, user_id, task, shift_start, shift_end)
SELECT e.event_id, v.user_id, v.task, e.start_time - INTERVAL '1 hour', e.end_time
FROM (VALUES
   (1, 10, 'Registration Desk'), (1, 11, 'Technical Support'),
   (3, 12, 'Stage Management'),  (3, 13, 'Hospitality'), (3, 14, 'Registration Desk'),
   (5, 15, 'Registration Desk'), (5, 16, 'Hall Setup'),
   (7, 17, 'Scorekeeping'),      (7, 18, 'Crowd Management'),
   (11, 19, 'Guest Reception')
) AS v(event_id, user_id, task)
JOIN events e ON e.event_id = v.event_id;

-- ---------------------------------------------------------------------
-- Budgets, expenses, sponsorships (budget_id matches event_id here)
-- ---------------------------------------------------------------------
INSERT INTO budgets (event_id, approved_by, allocated_amount, status) VALUES
 (1, 4, 50000.00,  'Approved'),
 (2, 5, 15000.00,  'Approved'),
 (3, 1, 250000.00, 'Approved'),
 (4, 4, 20000.00,  'Approved'),
 (5, 4, 30000.00,  'Approved'),
 (6, 5, 12000.00,  'Approved'),
 (7, 1, 80000.00,  'Approved'),
 (8, NULL, 25000.00,  'Pending'),
 (9, NULL, 18000.00,  'Pending'),
 (10, NULL, 22000.00, 'Pending'),
 (11, NULL, 150000.00,'Pending'),
 (12, 4, 5000.00,  'Rejected');

INSERT INTO expenses (budget_id, description, amount, expense_date) VALUES
 (1, 'Prizes for winning teams',      20000.00, CURRENT_DATE - 42),
 (1, 'Food and refreshments',         12000.00, CURRENT_DATE - 40),
 (1, 'Certificate printing',           3000.00, CURRENT_DATE - 41),
 (2, 'Robot kits and sensors',         8000.00, CURRENT_DATE - 27),
 (2, 'Refreshments',                   2500.00, CURRENT_DATE - 25),
 (3, 'Artist and performer fees',    120000.00, CURRENT_DATE - 20),
 (3, 'Stage and decoration',          60000.00, CURRENT_DATE - 16),
 (3, 'Sound and lighting hire',       35000.00, CURRENT_DATE - 16),
 (3, 'Security and crowd barriers',   15000.00, CURRENT_DATE - 15),
 (4, 'Judges honorarium',              5000.00, CURRENT_DATE - 9),
 (4, 'Refreshments',                   6000.00, CURRENT_DATE - 8),
 (4, 'Banners and printing',           2500.00, CURRENT_DATE - 10),
 (5, 'Posters and printing',           1500.00, CURRENT_DATE - 3),
 (6, 'Sensor and cloud credits',       4000.00, CURRENT_DATE - 2),
 (7, 'Trophies and medals',           15000.00, CURRENT_DATE - 4),
 (7, 'Referee fees',                   6000.00, CURRENT_DATE - 1);

INSERT INTO sponsorships (event_id, sponsor_id, amount, sponsorship_type) VALUES
 (1, 1, 30000.00,  'Cash'),
 (1, 4, 10000.00,  'Cash'),
 (2, 4, 5000.00,   'In-kind'),
 (3, 2, 50000.00,  'Cash'),
 (3, 3, 80000.00,  'Cash'),
 (4, 3, 10000.00,  'Cash'),
 (5, 1, 15000.00,  'Cash'),
 (7, 2, 20000.00,  'Cash'),
 (11, 3, 60000.00, 'Cash');

-- ---------------------------------------------------------------------
-- Approvals (Faculty -> HOD -> Admin)
-- ---------------------------------------------------------------------
-- Events 1 to 7: all three stages approved
INSERT INTO approvals (event_id, approver_id, stage, status, remarks, decided_at)
SELECT e.event_id,
       CASE s.stage WHEN 'Faculty' THEN CASE WHEN e.club_id = 2 THEN 3 ELSE 2 END
                    WHEN 'HOD'     THEN CASE WHEN e.club_id = 2 THEN 5 ELSE 4 END
                    ELSE 1 END,
       s.stage::approval_stage,
       'Approved',
       'Looks good, approved.',
       CASE s.stage WHEN 'Faculty' THEN LEAST(e.start_time - INTERVAL '10 days', now() - INTERVAL '3 days')
                    WHEN 'HOD'     THEN LEAST(e.start_time - INTERVAL '9 days',  now() - INTERVAL '2 days')
                    ELSE               LEAST(e.start_time - INTERVAL '8 days',  now() - INTERVAL '1 day') END
FROM events e
CROSS JOIN (VALUES ('Faculty'), ('HOD'), ('Admin')) AS s(stage)
WHERE e.event_id BETWEEN 1 AND 7;

-- Pending events show the workflow in progress
INSERT INTO approvals (event_id, approver_id, stage, status, remarks, decided_at) VALUES
 (8,  2,    'Faculty', 'Approved', 'Approved for Green Campus Club.', now() - INTERVAL '4 days'),
 (8,  4,    'HOD',     'Approved', 'Approved. Please coordinate with the grounds team.', now() - INTERVAL '2 days'),
 (8,  NULL, 'Admin',   'Pending',  NULL, NULL),
 (9,  3,    'Faculty', 'Approved', 'Approved.', now() - INTERVAL '1 day'),
 (9,  NULL, 'HOD',     'Pending',  NULL, NULL),
 (9,  NULL, 'Admin',   'Pending',  NULL, NULL),
 (11, 2,    'Faculty', 'Approved', 'Approved for the alumni office.', now() - INTERVAL '3 days'),
 (11, NULL, 'HOD',     'Pending',  NULL, NULL),
 (11, NULL, 'Admin',   'Pending',  NULL, NULL),
 (12, 2,    'Faculty', 'Approved', 'Approved.', now() - INTERVAL '12 days'),
 (12, 4,    'HOD',     'Rejected', 'Clashes with the internal exam schedule.', now() - INTERVAL '10 days'),
 (12, NULL, 'Admin',   'Pending',  NULL, NULL);

COMMIT;

-- Quick row counts for a sanity check
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'venue_bookings', count(*) FROM venue_bookings
UNION ALL SELECT 'registrations', count(*) FROM registrations
UNION ALL SELECT 'approvals', count(*) FROM approvals;
