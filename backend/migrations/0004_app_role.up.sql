-- Create a limited application role that IS subject to RLS.
-- The backend connects as 'licreamo' (superuser for schema management/migrations),
-- then drops to 'licreamo_app' inside each transaction via SET LOCAL ROLE.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'licreamo_app') THEN
        CREATE ROLE licreamo_app NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
    END IF;
END $$;

-- Schema access
GRANT USAGE ON SCHEMA public TO licreamo_app;

-- Table access (all current tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO licreamo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO licreamo_app;

-- Future tables created by licreamo will also be accessible to licreamo_app
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO licreamo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO licreamo_app;
