# Paddle promotions runbook

Tamamizu promotions use **Paddle standard discounts/coupon codes**. The app does not grant promotional access itself. Full Tamamizu entitlement still comes only from the existing server-verified Paddle `transaction.completed` / webhook path.

## One-time Human Gate before campaigns

In the **Paddle Live Dashboard**, confirm the checkout setting equivalent to **Display discount field on checkout** is enabled. The app explicitly asks Paddle Checkout to show the Add discount affordance, but Paddle documents that the dashboard setting must also be enabled.

This is a Live configuration action. AI must not change it.

## Run a promotion without deploying the app

1. In Paddle Live, create a **standard percentage discount**.
2. Restrict it to the Full Tamamizu product/Live price so it cannot apply to unrelated products.
3. Set an appropriate short `expires_at` and/or overall `usage_limit`.
4. Configure a customer-entered discount code and make it available for checkout redemption.
5. Share only the public promo code. Do not put API keys, client secrets, webhook secrets, purchase references, or transaction identifiers in campaign material.
6. When the campaign is over, let it expire or archive/deactivate it in Paddle.

No Tamamizu code change or redeploy is required for each campaign.

## 100% giveaways

Use a **100% percentage discount** rather than creating a direct/free entitlement shortcut. Paddle supports percentage discounts up to 100%.

The resulting checkout must still complete through Paddle and Full Tamamizu must still be provisioned through the normal completed-transaction/webhook entitlement path. Do not manually write entitlement state or bypass transaction correlation.

## Security and privacy invariants

- `purchase_ref` remains in-memory correlation data and is sent only as Paddle `customData`; promo codes do not replace or weaken it.
- Do not persist promo codes in localStorage as entitlement state.
- Do not grant access based on a promo code being present in the URL, DOM, or client state.
- Do not create Live discounts, run real charges/refunds, or mutate Production data as part of automated development/testing.

## Optional future campaign links

Paddle.js can prefill a public discount using `discountCode`, so a future `?promo=PUBLIC_CODE` campaign-link feature is possible. It is intentionally not required for launch: customer-entered codes already support zero-deploy campaigns with less application logic. If added later, treat the code as public marketing data only, never as authorization, and keep entitlement dependent on the completed Paddle transaction.

## References

- Paddle Developer Docs: Pass checkout settings (`showAddDiscounts`; dashboard prerequisite)
- Paddle Developer Docs: Create and manage discounts
- Paddle API reference: Create a discount (percentage discounts allow up to 100%)
