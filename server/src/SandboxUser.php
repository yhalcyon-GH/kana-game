<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Sandbox PoC only. There is no Magic Link / real account system yet (see
 * docs/paddle-webhook-poc.md and the frontend's own PoC page comments) —
 * every Sandbox purchase and every entitlement read in this PoC is
 * attributed to one fixed test identifier.
 *
 * DO NOT use this as a production user id. When real accounts/Magic Link
 * are built (a later phase), entitlements must be keyed by a real,
 * per-account identifier — never this constant.
 */
final class SandboxUser
{
    public const ID = 'sandbox-test-user';

    private function __construct()
    {
    }
}
