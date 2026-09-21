<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Ops/EphemeralDataCleanupRepository.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\Ops\EphemeralDataCleanupRepository;

const APPLY_FLAG = '--apply';
const CHECK_FLAG = '--check';
const HUMAN_APPROVAL_FLAG = '--human-approved-ephemeral-cleanup';

/** @param array<string,int> $counts */
function printCleanupCounts(string $prefix, array $counts): void
{
    printf(
        "%s magicLinkTokens=%d emailLoginChallenges=%d sessions=%d persistentSessions=%d purchaseIntents=%d\n",
        $prefix,
        $counts['magicLinkTokens'],
        $counts['emailLoginChallenges'],
        $counts['sessions'],
        $counts['persistentSessions'],
        $counts['purchaseIntents'],
    );
}

/** @param array<string,int> $counts */
function totalCleanupCounts(array $counts): int
{
    return array_sum($counts);
}

$args = array_slice($argv, 1);
$apply = in_array(APPLY_FLAG, $args, true);
$check = in_array(CHECK_FLAG, $args, true);
$approved = in_array(HUMAN_APPROVAL_FLAG, $args, true);

$knownArgs = [APPLY_FLAG, CHECK_FLAG, HUMAN_APPROVAL_FLAG];
foreach ($args as $arg) {
    if (!in_array($arg, $knownArgs, true)) {
        fwrite(STDERR, "cleanup refused: unknown argument\n");
        exit(2);
    }
}

if ($apply && $check) {
    fwrite(STDERR, "cleanup refused: choose --check or --apply\n");
    exit(2);
}
if ($apply && !$approved) {
    fwrite(STDERR, "cleanup refused: explicit human approval flag required\n");
    exit(2);
}
if (!$apply && $approved) {
    fwrite(STDERR, "cleanup refused: approval flag is only valid with --apply\n");
    exit(2);
}
if (!$apply && !$check && $args !== []) {
    fwrite(STDERR, "cleanup refused: invalid mode\n");
    exit(2);
}

$config = Config::load();
$pdo = Db::connect($config);
$repository = new EphemeralDataCleanupRepository($pdo);

$now = new DateTimeImmutable('now');
$cutoff = $now->modify('-' . EphemeralDataCleanupRepository::DEFAULT_GRACE_DAYS . ' days');

printf(
    "graceDays=%d batchLimit=%d\n",
    EphemeralDataCleanupRepository::DEFAULT_GRACE_DAYS,
    EphemeralDataCleanupRepository::DEFAULT_BATCH_LIMIT,
);

$before = $repository->preview($cutoff);
printCleanupCounts('eligible', $before);

if (!$apply) {
    echo "mode=check mutation=false\n";
    exit(0);
}

$deleted = $repository->applyOneBatch($cutoff);
printCleanupCounts('deleted', $deleted);

$remaining = $repository->preview($cutoff);
printCleanupCounts('remaining', $remaining);
echo 'moreEligible=' . (totalCleanupCounts($remaining) > 0 ? 'true' : 'false') . "\n";
echo "mode=apply mutation=true\n";
