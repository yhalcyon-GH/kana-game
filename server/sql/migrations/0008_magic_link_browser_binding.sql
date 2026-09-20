-- Security hardening: bind production Magic Links to the browser that
-- requested them. Additive only; existing/unexpired links keep NULL and are
-- deliberately rejected by cookie-mode verification after this migration.
--
-- Run after 0007_dev_harness_login_codes.sql.

ALTER TABLE magic_link_tokens
  ADD COLUMN browser_binding_hash CHAR(64) NULL AFTER token_hash;
