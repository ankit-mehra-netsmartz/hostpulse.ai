-- Migration: Add email/password authentication columns to users table
-- Run this once against your production database.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill: all existing Google OAuth users have verified emails
UPDATE users SET email_verified = TRUE WHERE account_type = 'google';
