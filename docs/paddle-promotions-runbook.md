# Paddle promotions runbook

Tamamizu promotions use **Paddle standard discounts/coupon codes**. The app does not grant promotional access itself. Full Tamamizu entitlement still comes only from the existing server-verified Paddle `transaction.completed` / webhook path.

## Campaign setup Human Gate

Create and manage campaign discounts in the **Paddle Live Dashboard**. Each
discount used by a Tamamizu campaign link must be active, have a public
letters/digits checkout code, and be enabled for checkout redemption.

Tamamizu intentionally sets Paddle Checkout's `showAddDiscounts: false`. Buyers
never need to find Paddle's manual **Add discount** control. Paddle documents
that a prefilled `discountCode` still works when that manual affordance is
hidden.

Creating, editing, expiring, archiving, or changing limits on a Paddle Live
discount remains a Human Gate. AI must not perform those Live mutations.

## Run a promotion without deploying the app

1. In Paddle Live, create a **standard percentage discount**.
2. Restrict it to the Full Tamamizu product/Live price so it cannot apply to unrelated products.
3. Set an appropriate short `expires_at` and/or overall `usage_limit`.
4. Configure a letters/digits checkout code and make it available for checkout redemption.
5. Share the Tamamizu campaign URL, not instructions for finding a coupon field:
   `https://app.tamamizu.giganihongo.com/#/account?promo=PUBLIC_CODE`
6. Do not put API keys, client secrets, webhook secrets, purchase references, or transaction identifiers in campaign material.
7. When the campaign is over, let it expire or archive/deactivate it in Paddle.

No Tamamizu code change or redeploy is required for each campaign.

## 100% giveaways

Use a **100% percentage discount** rather than creating a direct/free entitlement shortcut. Paddle supports percentage discounts up to 100%.

The resulting checkout must still complete through Paddle and Full Tamamizu must still be provisioned through the normal completed-transaction/webhook entitlement path. Do not manually write entitlement state or bypass transaction correlation.

Tamamizu's previously completed Live verification confirmed that a valid 100%
discount reaches a zero-total Paddle checkout without requiring card details.
The app does not hard-code that campaign: it renders **FREE** only when Paddle's
live checkout totals actually report zero.

## Security and privacy invariants

- `purchase_ref` remains in-memory correlation data and is sent only as Paddle `customData`; promo codes do not replace or weaken it.
- Do not persist promo codes in localStorage as entitlement state.
- Do not grant access based on a promo code being present in the URL, DOM, or client state.
- Do not create Live discounts, run real charges/refunds, or mutate Production data as part of automated development/testing.

## Campaign links

Tamamizu supports shareable promo links on the production HashRouter account route:

```text
https://app.tamamizu.giganihongo.com/#/account?promo=PUBLIC_CODE
```

The Account page accepts only 1-32 ASCII letters/digits from the `promo`
query parameter, acknowledges a valid code in the purchase UI, and passes it
to Paddle Checkout as `discountCode`. The manual Paddle **Add discount**
control is intentionally hidden so there is only one promotion path.

When a buyer opens the promo account link while signed out, the current Email
OTP flow preserves the validated `promo` query through sign-in and returns to
the Account page with the same code. Once the buyer accepts Tamamizu's purchase
policies and continues, promo checkout opens inline on the Account page. The
always-visible Tamamizu summary is populated only from Paddle checkout event
totals, so it can show the actual subtotal, discount, tax, and final total for
50%, 100%, or other valid percentage campaigns without a code-specific app
deployment. A zero Paddle total is shown as **FREE**.

If a campaign link reaches Paddle but Paddle does not actually apply a positive
discount, Tamamizu closes that checkout and shows a promotion-specific error
instead of silently allowing a full-price purchase.

Promo codes remain public marketing data: they are never written into Paddle
`customData`, never replace the private `purchase_ref`, and never grant
access directly. Entitlement still depends only on the completed Paddle
transaction/webhook path.

A campaign link does not create, enable, extend, or otherwise mutate a Paddle
Live discount. The human operator still creates/limits/expires the code in the
Paddle Live Dashboard under the Human Gate described above.

## References

- Paddle Developer Docs: Hide the option to add a discount (`showAddDiscounts: false` still permits prefilled discounts)
- Paddle Developer Docs: Create and manage discounts
- Paddle API reference: Create a discount (percentage discounts allow up to 100%)
