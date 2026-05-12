DROP INDEX IF EXISTS idx_payments_receipt_group;
DROP INDEX IF EXISTS idx_payments_tenant_status;
DROP INDEX IF EXISTS idx_payments_status;
DROP INDEX IF EXISTS payments_enrollment_fee_unique;
DROP INDEX IF EXISTS payments_enrollment_period_unique;

ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_period_month_check,
    DROP CONSTRAINT IF EXISTS payments_kind_check;

ALTER TABLE payments
    DROP COLUMN IF EXISTS receipt_group_id,
    DROP COLUMN IF EXISTS period_month,
    DROP COLUMN IF EXISTS period_year,
    DROP COLUMN IF EXISTS kind;

ALTER TABLE courses DROP COLUMN IF EXISTS enrollment_fee;
