-- Email OTP + persistent login follow-up — additive, DEV-ONLY migration.
--
-- This table exists ONLY to support the /account-test development
-- harness's OTP (6-digit email sign-in code) flow, mirroring
-- 0003_dev_harness_magic_links.sql's role for the Magic Link flow. It
-- NEVER participates in production auth logic — no production code path
-- reads or writes it. server/dev-only/last-login-code.php refuses to
-- operate at all unless DEV_HARNESS_ENABLED is explicitly set truthy
-- (defaults false/absent). server/dev-only/ is excluded from the
-- production deployment manifest (see docs/paddle-auth-phase3a-pr-c.md
-- and docs/xserver-api-deployment-plan.md) — omitting THIS MIGRATION
-- from a production Xserver deployment is equally safe and recommended,
-- since nothing else depends on this table existing.
--
-- INTENTIONAL EXCEPTION to this codebase's normal "raw values are never
-- persisted" rule: the code column below stores the RAW, plaintext
-- 6-digit sign-in code — not a hash. This is the SAME kind of
-- deliberate, narrowly-scoped exception 0003_dev_harness_magic_links.sql's
-- magic_link_url column already is, adapted for a short numeric code
-- instead of a URL. It is safe only because (a) the table is dev-only
-- and gated by DEV_HARNESS_ENABLED, (b) retrieval consumes (deletes) the
-- row immediately on success, and (c) this table is never read by any
-- production code path.

CREATE TABLE IF NOT EXISTS dev_harness_login_codes (
  email_normalized VARCHAR(255) NOT NULL PRIMARY KEY,
  -- Raw, dev-only exception — see the file-level comment above.
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
