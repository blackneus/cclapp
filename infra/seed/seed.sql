-- Idempotent seed: tenant licreamo + admin user
-- Admin password is set by the Go application on startup (not here)
-- This file is kept for documentation; actual seeding is done by backend/cmd/api/main.go

BEGIN;

INSERT INTO tenants (id, slug, subdomain, name, branding)
VALUES (
    gen_random_uuid(),
    'licreamo',
    'ccl',
    'LICREAMO',
    '{"primary_color": "#1f3a8a", "logo_url": null}'::jsonb
)
ON CONFLICT (subdomain) DO NOTHING;

COMMIT;
