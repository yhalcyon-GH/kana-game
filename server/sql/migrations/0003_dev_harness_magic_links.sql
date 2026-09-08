-- Phase 3A, PR C — additive, DEV-ONLY migration.
--
-- This table exists ONLY to support the /account-test development
-- harness (see docs/paddle-auth-phase3a-pr-c.md). It NEVER participates
-- in production auth or entitlement logic — no production code path
-- reads or writes it. server/dev-only/last-magic-link.php refuses to
-- operate at all unless DEV_HARNESS_ENABLED is explicitly set truthy
-- (defaults false/absent). server/dev-only/ is excluded from the
-- production deployment manifest (see docs/paddle-auth-phase3a-pr-c.md)
-- — omitting THIS MIGRATION from a production Xserver deployment is
-- equally safe and recommended, since nothing else depends on this
-- table existing.
--
-- INTENTIONAL EXCEPTION to this codebase's normal "raw tokens are never
-- persisted" rule: magic_link_url column below stores the RAW,
-- fragment-encoded magic-link URL (including the raw token) — not a
-- hash. This is deliberate and scoped: it exists solely so a developer
-- exercising /account-test locally can retrieve the link FakeMailer/a
-- real mailer would otherwise have sent by email, since PHP has no
-- shared memory across separate HTTP requests. This is safe only
-- because (a) the table is dev-only and gated by DEV_HARNESS_ENABLED,
-- (b) retrieval consumes (deletes) the row immediately on success, and
-- (c) this table is never read by any production code path.

CREATE TABLE IF NOT EXISTS dev_harness_magic_links (
  email_normalized VARCHAR(255) NOT NULL,
  -- Raw, dev-only exception — see the file-level comment above.
  magic_link_url TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
