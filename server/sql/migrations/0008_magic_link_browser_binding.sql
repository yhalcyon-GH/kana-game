-- Security hardening: bind production Magic Links to the browser that
-- requested them. Additive only; existing/unexpired links keep NULL and are
-- deliberately rejected by cookie-mode verification after this migration.
--
-- Production may intentionally skip dev-only migration 0007. This migration
-- depends only on 0001's magic_link_tokens table, so run it after the
-- Production migration set through 0006; 0007 is optional/dev-only.

ALTER TABLE magic_link_tokens
  ADD COLUMN browser_binding_hash CHAR(64) NULL AFTER token_hash;
