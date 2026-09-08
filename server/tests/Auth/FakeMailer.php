<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

require_once __DIR__ . '/../../src/Auth/Mailer.php';

/**
 * TEST-ONLY. Lives under server/tests/Auth/, not server/src/Auth/ — it
 * has no reason to be part of the production deployment. Its in-memory
 * state does NOT and CANNOT survive across separate HTTP requests —
 * each PHP-FPM/CGI request is a fresh process with no shared memory.
 * FakeMailer is therefore only ever instantiated inside same-process
 * PHP unit tests (server/tests/Auth/MagicLinkAuthServiceTest.php) —
 * never by any real entrypoint. request-link.php uses its own inline
 * no-op Mailer implementation, not this class, for exactly that reason.
 *
 * Despite being namespaced KanaGame\Paddle\Auth (matching the interface
 * it implements), this file is intentionally NOT under server/src/ —
 * PHP namespaces don't have to match directory structure 1:1 in a
 * project with no autoloader (this repo has none; every file is
 * require_once'd explicitly), and keeping the namespace consistent with
 * Mailer's own namespace is clearer than inventing a separate
 * KanaGame\Paddle\Tests\Auth namespace solely for this one class.
 */
final class FakeMailer implements Mailer
{
    /** @var list<array{email: string, url: string}> */
    public array $sent = [];

    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
        $this->sent[] = ['email' => $emailNormalized, 'url' => $magicLinkUrl];
    }
}
