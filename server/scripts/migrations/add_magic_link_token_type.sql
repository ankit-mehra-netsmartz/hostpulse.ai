-- Add type column to reuse the existing token table for magic links
ALTER TABLE email_verification_tokens
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'magic_link';

-- Update account_type check if one exists (adjust to your DB constraint name)
-- If account_type has a CHECK constraint, drop and recreate it:
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
-- ALTER TABLE users ADD CONSTRAINT users_account_type_check
--   CHECK (account_type IN ('google', 'magic'));
