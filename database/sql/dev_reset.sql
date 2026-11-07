-- =====================================================================
-- EventOps: wipe the database objects so you can start fresh
-- File : database/reset.sql
-- Run  : psql -d eventops -f database/reset.sql
-- WARNING: this deletes every table, type and row in the public schema.
-- =====================================================================
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
