-- Normalize legacy emails only after checking for case-insensitive collisions.
-- A collision must be resolved explicitly; silently choosing an account would
-- risk merging two different owners or making one account inaccessible.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email: case-insensitive duplicate addresses exist. Resolve duplicates before retrying this migration.';
  END IF;
END $$;

UPDATE users
SET email = LOWER(BTRIM(email))
WHERE email <> LOWER(BTRIM(email));

-- Protect the invariant even if a future writer bypasses the API repository.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(BTRIM(email)));
ALTER TABLE users
  ADD CONSTRAINT users_email_normalized_check
  CHECK (email = LOWER(BTRIM(email)));

-- Existing one-time links remain usable until expiry. New links store only
-- tokenHash; token stays nullable solely for legacy rows during the rollout.
ALTER TABLE password_reset_tokens ALTER COLUMN token DROP NOT NULL;
ALTER TABLE password_reset_tokens ADD COLUMN token_hash TEXT;
CREATE UNIQUE INDEX password_reset_tokens_token_hash_key
  ON password_reset_tokens (token_hash);
ALTER TABLE password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_token_or_hash_check
  CHECK (token IS NOT NULL OR token_hash IS NOT NULL);

ALTER TABLE email_verification_tokens ALTER COLUMN token DROP NOT NULL;
ALTER TABLE email_verification_tokens ADD COLUMN token_hash TEXT;
CREATE UNIQUE INDEX email_verification_tokens_token_hash_key
  ON email_verification_tokens (token_hash);
ALTER TABLE email_verification_tokens
  ADD CONSTRAINT email_verification_tokens_token_or_hash_check
  CHECK (token IS NOT NULL OR token_hash IS NOT NULL);
