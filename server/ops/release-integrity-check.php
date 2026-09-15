<?php

declare(strict_types=1);

/**
 * Operator-only CLI check: calculates a stable SHA-256 fingerprint of the
 * deployed, non-secret API release files listed in release-integrity-manifest.json.
 * It never reads config.php, environment values, database data, or tokens.
 *
 * Output is intentionally fixed and redacted:
 *   releaseContentSha256=<64 lowercase hex>
 *   OK
 */
try {
    $apiRoot = dirname(__DIR__);
    $manifestPath = __DIR__ . '/release-integrity-manifest.json';
    $manifestRaw = file_get_contents($manifestPath);
    $manifest = is_string($manifestRaw) ? json_decode($manifestRaw, true, 512, JSON_THROW_ON_ERROR) : null;
    if (!is_array($manifest)) {
        throw new RuntimeException('invalid manifest');
    }

    $files = [];
    foreach (($manifest['directories'] ?? []) as $directory) {
        if (!is_string($directory) || $directory === '' || str_contains($directory, '..')) {
            throw new RuntimeException('unsafe directory');
        }
        $absoluteDirectory = $apiRoot . '/' . $directory;
        if (!is_dir($absoluteDirectory)) {
            throw new RuntimeException('missing directory');
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($absoluteDirectory, FilesystemIterator::SKIP_DOTS),
        );
        foreach ($iterator as $entry) {
            if ($entry->isFile()) {
                $files[] = str_replace('\\', '/', substr($entry->getPathname(), strlen($apiRoot) + 1));
            }
        }
    }

    foreach (($manifest['files'] ?? []) as $file) {
        if (!is_string($file) || $file === '' || str_contains($file, '..') || !is_file($apiRoot . '/' . $file)) {
            throw new RuntimeException('missing file');
        }
        $files[] = $file;
    }

    $files = array_values(array_unique($files));
    sort($files, SORT_STRING);

    $parts = [];
    foreach ($files as $file) {
        $digest = hash_file('sha256', $apiRoot . '/' . $file);
        if (!is_string($digest)) {
            throw new RuntimeException('unreadable file');
        }
        $parts[] = $file . ':' . $digest;
    }

    fwrite(STDOUT, 'releaseContentSha256=' . hash('sha256', implode("\n", $parts) . "\n") . "\nOK\n");
    exit(0);
} catch (Throwable) {
    fwrite(STDERR, "INTEGRITY_CHECK_FAILED\n");
    exit(1);
}
