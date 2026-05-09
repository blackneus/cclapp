-- Force RLS even when the table owner (licreamo superuser) runs queries.
-- This is required because the app connects as the same user that owns the tables.
-- Without FORCE ROW LEVEL SECURITY, superusers bypass RLS policies.

ALTER TABLE users                FORCE ROW LEVEL SECURITY;
ALTER TABLE courses              FORCE ROW LEVEL SECURITY;
ALTER TABLE modules              FORCE ROW LEVEL SECURITY;
ALTER TABLE lessons              FORCE ROW LEVEL SECURITY;
ALTER TABLE quizzes              FORCE ROW LEVEL SECURITY;
ALTER TABLE questions            FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollments          FORCE ROW LEVEL SECURITY;
ALTER TABLE attempts             FORCE ROW LEVEL SECURITY;
ALTER TABLE answers              FORCE ROW LEVEL SECURITY;
ALTER TABLE payments             FORCE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods      FORCE ROW LEVEL SECURITY;
ALTER TABLE payroll_items        FORCE ROW LEVEL SECURITY;
ALTER TABLE teacher_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE class_sessions       FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_logs    FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           FORCE ROW LEVEL SECURITY;
