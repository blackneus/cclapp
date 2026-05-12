ALTER TABLE users
    DROP COLUMN IF EXISTS birthday,
    DROP COLUMN IF EXISTS avatar_url;
