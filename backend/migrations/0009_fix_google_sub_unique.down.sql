DROP INDEX IF EXISTS users_tenant_google_sub_unique;

ALTER TABLE users
    ADD CONSTRAINT users_tenant_id_google_sub_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, google_sub);
