<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\ProductMatcher;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/ProductMatcher.php';

/**
 * @return array<string, callable(): void>
 */
function productMatcherTests(): array
{
    return [
        'matches() returns true when items contain the exact configured price and product id' => function () {
            $data = [
                'items' => [
                    ['price' => ['id' => 'pri_expected', 'product_id' => 'pro_expected']],
                ],
            ];
            assertTrue(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'exact price+product match should return true',
            );
        },

        'matches() returns false when the price id is wrong' => function () {
            $data = [
                'items' => [
                    ['price' => ['id' => 'pri_wrong', 'product_id' => 'pro_expected']],
                ],
            ];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a wrong price id must not match even if the product id is correct',
            );
        },

        'matches() returns false when the product id is wrong' => function () {
            $data = [
                'items' => [
                    ['price' => ['id' => 'pri_expected', 'product_id' => 'pro_wrong']],
                ],
            ];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a wrong product id must not match even if the price id is correct',
            );
        },

        'matches() returns false when items is missing' => function () {
            $data = [];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'missing items must not match',
            );
        },

        'matches() returns false when items is not an array' => function () {
            $data = ['items' => 'not-an-array'];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a non-array items field must not match',
            );
        },

        'matches() returns false for a malformed item missing the price object' => function () {
            $data = ['items' => [['not_price' => 'value']]];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a malformed item with no price object must not match',
            );
        },

        'matches() returns false for a malformed item where price is not an array' => function () {
            $data = ['items' => [['price' => 'not-an-array']]];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a malformed item where price is a scalar must not match',
            );
        },

        'matches() ignores non-array entries in the items list' => function () {
            $data = [
                'items' => [
                    'not-an-item',
                    ['price' => ['id' => 'pri_expected', 'product_id' => 'pro_expected']],
                ],
            ];
            assertTrue(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a malformed sibling entry must not prevent matching a valid one elsewhere in the list',
            );
        },

        'matches() returns true when multiple items are present and exactly one matches the configured price/product' => function () {
            $data = [
                'items' => [
                    ['price' => ['id' => 'pri_other', 'product_id' => 'pro_other']],
                    ['price' => ['id' => 'pri_expected', 'product_id' => 'pro_expected']],
                    ['price' => ['id' => 'pri_another', 'product_id' => 'pro_another']],
                ],
            ];
            assertTrue(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'a matching item anywhere in a multi-item list should match, per existing Phase 2 semantics',
            );
        },

        'matches() returns false when multiple items are present and none match' => function () {
            $data = [
                'items' => [
                    ['price' => ['id' => 'pri_other', 'product_id' => 'pro_other']],
                    ['price' => ['id' => 'pri_another', 'product_id' => 'pro_another']],
                ],
            ];
            assertFalse(
                ProductMatcher::matches($data, 'pri_expected', 'pro_expected'),
                'no item matching the configured price/product must return false',
            );
        },
    ];
}
