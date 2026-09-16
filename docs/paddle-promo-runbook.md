# Paddle Promo Code Runbook (No-Deploy Promotions)

Operator runbook for running discount/giveaway campaigns through Paddle
**without changing app code or redeploying**. No secrets are recorded here —
only Paddle Dashboard steps and what to verify.

## Why this works with zero app changes

Paddle standard discounts are the only promotion mechanism this app supports.
The app never hard-codes a campaign discount and never grants access
directly — entitlement is always produced by the existing
`transaction.completed` webhook → entitlement path
(`server/src/Purchase/PurchaseWebhookHandler.php`), the same path used for
every ordinary paid purchase. A discount changes only the transaction amount
Paddle reports; it does not add or bypass any code path. See
`server/tests/Purchase/PurchaseWebhookHandlerTest.php` — the entitlement
match (`ProductMatcher::matches`, `server/src/ProductMatcher.php`) checks
only `price.id`/`price.product_id`, never the transaction amount, so a
100%-off ($0) transaction grants entitlement identically to a paid one.

The checkout overlay always requests Paddle's own "Add discount" field
explicitly (`settings.showAddDiscounts: true` in
`src/lib/paddle/sandboxCheckoutController.ts`), so a customer-entered code
works with **no app change** for any given campaign — only Dashboard
configuration changes per campaign.

## One-time Human Gate (Paddle Live Dashboard)

- [ ] **Human required, Live operation** — Paddle Dashboard → Checkout
  settings → **"display discount field on checkout"** (or current Paddle
  UI equivalent) must be enabled. This is a one-time account-level Paddle
  Live setting change and must be made by a human directly in the Paddle
  Dashboard. AI sessions must never change Paddle Live settings.
  - **Status as of 2026-09-16 (human-verified):** already enabled. A human
    operator ran a real Live checkout with a discount code and confirmed the
    "Add discount" affordance was visible and the code applied successfully
    — see the human evidence comments on issue #273. No further action is
    needed unless Paddle changes this setting or it is later found disabled.

## Running a campaign (repeatable, no deploy)

All of the following are ordinary Paddle Dashboard operations — none require
an app code change or redeploy:

1. **Create a standard discount** in the Paddle Dashboard: Catalog →
   Discounts → New discount. Choose a percentage discount (1–100%).
2. **Restrict it** to Full Tamamizu / the exact Live price the app is
   configured with (`VITE_PADDLE_PRICE_ID` for the Production build) —
   don't leave it store-wide unless that's genuinely intended.
3. **Set a short expiry** (`expires_at`) and/or a **redemption cap**
   (`usage_limit`) appropriate to the campaign — e.g. `usage_limit: 1` for a
   single test or invite, or a small cap for a limited giveaway.
4. **Enable customer checkout redemption** with a short, shareable code (the
   discount's checkout-entered code). The checkout overlay already shows the
   "Add discount" field (see above), so customers can enter it directly —
   no `discountCode`/`discountId` prefill is required for ordinary manual
   entry.
5. **Share the code** through whatever channel is appropriate for the
   campaign (do not commit it to the repo or put it in app config).
6. **For a 100%-off giveaway**, use a 100% standard discount exactly as
   above — never a custom in-app free-entitlement shortcut. The purchase
   still goes through the normal Paddle Checkout → `transaction.completed`
   webhook → entitlement path.
7. **Archive or let the discount expire** when the campaign ends. An
   expired/archived/usage-exhausted discount simply stops being redeemable;
   no app-side cleanup is needed.

## Empirical Live evidence: 100%-off giveaways (2026-09-16)

A human operator ran one controlled, human-approved Paddle Live test (see
issue #273 comments) to measure real zero-value checkout behavior:

- A Live checkout discount code was created, restricted for testing, set to
  100% off, and redeemed once in Production.
- The checkout showed the existing "Add discount" affordance; the code
  applied successfully.
- After applying 100% off, checkout completed **with no card/payment-method
  details required**.
- The resulting Paddle transaction showed: Amount paid $0.00, Transaction
  total $0.00, Tax withheld $0.00, Paddle fee $0.00, Net amount $0.00, Total
  earnings $0.00.

**This is empirical evidence for this Paddle Live account/test case, not a
universal Paddle contractual guarantee.** Do not assume it holds for every
account, region, tax jurisdiction, or future Paddle pricing change — verify
again with a fresh, human-approved, minimal Live test before relying on it
for large-scale giveaway economics.

The human operator did not separately re-confirm the app's
`Full Tamamizu: Active` state after that specific $0 checkout in chat.
Automated source-level coverage of the equivalent case (a zero-value
`transaction.completed` webhook event) is in
`server/tests/Purchase/PurchaseWebhookHandlerTest.php` ("a 100%-off discount
transaction (zero total) grants entitlement through the identical path as a
paid one"), which exercises the real handler/entitlement code, not a mock —
but it is not a substitute for a future human end-to-end confirmation if one
is convenient to add during a later Live promo test.

## Not done / optional only

A public campaign link that prefills a non-secret promo code (e.g.
`?promo=CODE` → Paddle.js `discountCode`) was evaluated per this issue's
"nice-to-have only if minimal and safe" guidance and **not implemented**.
Wiring it in safely would require passing the code through
`prepare()`/`open()` in `sandboxCheckoutController.ts` without persisting it
in `localStorage`/`sessionStorage` and without it ever reaching
`customData`/`purchase_ref` correlation — that's more surface area than
"ask the customer to type the code into the field Paddle already shows,"
which needs no app change at all. If a future campaign specifically needs a
prefilled link, treat it as its own small, separately reviewed change.
