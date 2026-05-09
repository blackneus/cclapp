-- RLS isolation test: demonstrates tenant A cannot see tenant B data
-- Run after migrations: psql $DATABASE_URL -f infra/seed/test_rls.sql
-- Expected output: NOTICE: RLS isolation test PASSED

-- Step 1: Create test tenants as superuser (outside the RLS-restricted role)
INSERT INTO tenants (slug, subdomain, name)
VALUES
    ('test-tenant-a', 'test-a', 'Test Tenant A'),
    ('test-tenant-b', 'test-b', 'Test Tenant B')
ON CONFLICT (subdomain) DO NOTHING;

DO $$
DECLARE
    v_tenant_a UUID;
    v_tenant_b UUID;
    v_count    INT;
BEGIN
    SELECT id INTO v_tenant_a FROM tenants WHERE subdomain = 'test-a';
    SELECT id INTO v_tenant_b FROM tenants WHERE subdomain = 'test-b';

    -- Drop to licreamo_app role so RLS policies are enforced (same as the application does)
    SET LOCAL ROLE licreamo_app;

    -- With no tenant set: should see 0 rows (NULL tenant_id = no match)
    PERFORM set_config('app.tenant_id', '', true);

    -- Create a user in tenant A (using superuser context is needed for insert)
    -- Reset role temporarily to insert
    RESET ROLE;
    INSERT INTO users (tenant_id, email, password_hash, full_name, role)
    VALUES (v_tenant_a, 'rls-test@test-a.com', 'hash_placeholder', 'RLS Test User A', 'admin')
    ON CONFLICT (tenant_id, email) DO NOTHING;

    -- Switch back to app role for the RLS-enforced reads
    SET LOCAL ROLE licreamo_app;

    -- With RLS context of tenant A: should see only tenant A's user(s)
    PERFORM set_config('app.tenant_id', v_tenant_a::text, true);
    SELECT COUNT(*) INTO v_count FROM users WHERE email = 'rls-test@test-a.com';
    ASSERT v_count = 1,
        format('FAIL: Tenant A should see its own user, got %s', v_count);

    -- With RLS context of tenant B: should see 0 rows from tenant A
    PERFORM set_config('app.tenant_id', v_tenant_b::text, true);
    SELECT COUNT(*) INTO v_count FROM users WHERE email = 'rls-test@test-a.com';
    ASSERT v_count = 0,
        format('FAIL: Tenant B should NOT see tenant A user (isolation breach!), got %s', v_count);

    RAISE NOTICE 'RLS isolation test PASSED';

    -- Rollback so test data does not persist
    RAISE EXCEPTION 'rollback_test' USING ERRCODE = 'P0001';

EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
        -- Expected: clean rollback of test data
        NULL;
END $$;
