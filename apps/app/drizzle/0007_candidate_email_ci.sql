-- De-duplicate candidates by email, case-insensitively.
--
-- The application lowercases every address before writing, but that is a
-- convention: one future code path that forgets, or a direct insert, and the
-- same person exists twice. A functional unique index makes the guarantee the
-- database's rather than the caller's.
--
-- Written by hand: drizzle-kit does not model expression indexes, so this must
-- not be regenerated away.
CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_lower_unique
  ON candidates (lower(email));
