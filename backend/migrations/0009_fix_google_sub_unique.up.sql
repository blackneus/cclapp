-- The original UNIQUE NULLS NOT DISTINCT (tenant_id, google_sub) blocks creating
-- more than one user without Google OAuth in the same tenant (NULL == NULL).
-- Replace it with a partial unique index that only enforces uniqueness when
-- google_sub IS NOT NULL.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_google_sub_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_google_sub_unique
    ON users (tenant_id, google_sub)
    WHERE google_sub IS NOT NULL;
