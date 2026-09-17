-- Phase (email OTP + persistent login), PR A — additive migration. Adds
-- the 6-digit email code challenge table and the persistent ("remember
-- this browser") credential table, plus a nullable link column on
-- sessions. Does NOT alter, drop, or rename users, magic_link_tokens,
-- sessions' existing columns, or rate_limits — Magic Link stays fully
-- functional as fallback (see server/src/Auth/MagicLinkAuthService.php).
--
-- Run this once, after 0001_users_auth_foundation.sql and
-- 0002_purchase_attribution.sql, against the same MariaDB 10.5+ database.
-- This migration is NOT deployed to Xserver as part of this PR.

CREATE TABLE IF NOT EXISTS email_login_challenges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- SHA-256 hex digest of the raw opaque challenge token returned to the
  -- browser as {"challenge": "..."}. Raw challenge token is NEVER stored
  -- — same raw-never-stored pattern as magic_link_tokens.token_hash.
  challenge_token_hash CHAR(64) NOT NULL,
  -- The pending identity a request-code call was issued for. NOT a FK to
  -- users at insert time — request-code.php never creates or looks up a
  -- users row (find-or-create happens only on successful verify).
  email_normalized VARCHAR(255) NOT NULL,
  -- HMAC-SHA256(challenge_token_raw + ":" + code, LOGIN_CODE_PEPPER) hex
  -- digest. LOGIN_CODE_PEPPER is a DISTINCT secret from RATE_LIMIT_PEPPER
  -- — see server/src/Auth/RateLimiter.php's doc comment on why the two
  -- must never be the same value. The plaintext code is NEVER stored.
  code_mac CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  -- Incremented on every incorrect-code attempt against this challenge.
  -- At LOGIN_CODE_MAX_ATTEMPTS (default 5), the challenge is dead — see
  -- EmailLoginChallengeRepository::consumeAttempt().
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- Set by the atomic conditional UPDATE in
  -- EmailLoginChallengeRepository::consumeAttempt() on a successful code
  -- match — enforces single-use. NULL means still open.
  used_at DATETIME NULL,
  -- Set when a resend (a second request-code call for the same email)
  -- supersedes this still-open challenge — see
  -- EmailLoginChallengeRepository::invalidateActiveForEmail(). A resend
  -- invalidates the prior code per the spec.
  invalidated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_challenge_token_hash (challenge_token_hash),
  KEY idx_email_normalized (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS persistent_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- SHA-256 hex digest of the raw 256-bit token in the
  -- __Host-tamamizu_remember cookie. Raw token is NEVER stored — this is
  -- a real long-lived account credential, treated with at least the same
  -- care as sessions.token_hash.
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  -- Absolute, not sliding: created_at + PERSISTENT_LOGIN_DAYS, fixed at
  -- creation time and never extended by use.
  expires_at DATETIME NOT NULL,
  -- Set on explicit sign-out-others.php, logout.php's persistent-credential
  -- revoke, or LRU eviction on a 4th login. NULL means still active.
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Touched on every legitimate use (a fresh OTP login that reuses this
  -- row is impossible -- each login creates a NEW persistent_sessions
  -- row -- so in practice this is touched by the session-refresh path in
  -- CurrentUserService::resolveOrRefresh()). This is the field LRU
  -- eviction orders by.
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token_hash (token_hash),
  KEY idx_user_id_last_seen (user_id, last_seen_at),
  CONSTRAINT fk_persistent_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nullable link so revoking/evicting a persistent credential can
-- cascade-revoke its linked normal sessions at the APPLICATION level
-- (see SessionRepository::revokeByPersistentSessionId()), keeping the
-- same explicit-revocation audit pattern as the rest of this schema
-- rather than a DB-level cascade delete.
ALTER TABLE sessions
  ADD COLUMN persistent_session_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD CONSTRAINT fk_sessions_persistent_session
    FOREIGN KEY (persistent_session_id) REFERENCES persistent_sessions (id) ON DELETE SET NULL,
  ADD KEY idx_persistent_session_id (persistent_session_id);
