# Final legal-readiness audit — 2026-09-20

This is an AI-assisted pre-launch audit, not a final legal determination. It records what the current product/repository already does, what current official sources say, and the specific decisions or identity/contact facts that still require the human operator. It does not store private identity data or secrets.

## Sources checked

Current official sources checked on 2026-09-20:

- Paddle Seller Handbook: https://www.paddle.com/seller-guides/seller-handbook
- Paddle Buyer Terms: https://www.paddle.com/legal/buyer-terms
- Paddle Refund Policy: https://www.paddle.com/legal/refund-policy
- Paddle buyer FAQ / Merchant of Record explanation: https://www.paddle.com/help/manage/your-customers/buyers-refunds
- UK ICO, privacy information that should be provided: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/
- EU GDPR Article 13: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- XServer error-log manual: https://www.xserver.ne.jp/manual/man_server_logerror.php

## Already aligned

- Full Access is presented as a one-time purchase, not a subscription.
- Base price and tax wording are shown before checkout.
- Terms, Refund Policy, Privacy Policy, and Support are linked from the purchase surface.
- A support email is published.
- The refund policy gives a full 14-day refund without a usage condition. This is more generous than Paddle's default global refund baseline and does not remove non-waivable consumer rights.
- Checkout/payment/tax handling is delegated to Paddle, and real Production purchase/refund behavior has already been validated.
- The app does not grant entitlement from client-side checkout completion; entitlement remains server-authoritative.
- The Privacy Policy describes local learning-progress storage, microphone/speech behavior, hosting, purchases, deletion requests, analytics/feedback behavior, and a support/privacy contact.
- Issue #320 corrected factual privacy copy that had become stale after Email OTP and persistent login shipped: Production now uses a six-digit code as the normal sign-in path with Magic Link fallback, and persistent login uses two authentication cookies rather than one.
- The unsupported fixed “about 90 days” application-log retention statement was removed. The policy now uses retention criteria instead, because actual XServer log retention/settings are a remaining Human Gate.

## Human legal decisions / information still required

### 1. Supplier/operator identity — decided

The previously approved public identity is retained: **Tamamizu** is the public-facing supplier/operator and product/service name. `GigaNihongo` remains an underlying technical/umbrella identity and may appear in infrastructure or payment records, but it is not used as the public operator name in Tamamizu's Terms, Privacy, or Support pages. No private legal name or home address is published.

### 2. Support telephone/contact requirements

Paddle's Seller Handbook currently says buyer support details should include email and phone number. Tamamizu currently publishes an email address but no phone number.

**Human decision required:** confirm with Paddle/current account requirements whether a telephone number must be publicly displayed for this seller/account, and if so choose the public support number to publish. Do not invent or expose a private phone number.

### 3. Explicit acceptance of supplier Terms / Refund Policy

The current Account purchase surface says “By continuing, review…” and links the policies. Paddle's Seller Handbook says the buyer should accept the seller's Terms and refund policy before purchase, and Paddle Buyer Terms treat the Supplier Agreement as part of the purchase relationship.

**Human legal approval required:** approve the final click-wrap wording/mechanism (for example, wording tied directly to selecting “Buy Full Access”, or a checkbox if counsel/Paddle requires one). This changes the legal acceptance mechanism, so it is not an AI-only copy edit.

### 4. Paddle Merchant-of-Record wording — decided and implemented

The project had already decided to use Paddle as Merchant of Record. The 2026-09-20 legal-copy update now states in Terms that Paddle.com conducts the order process as online reseller and is Merchant of Record, and explains Paddle's payment/tax/order-support/return role. Support carries the same role split. Final human legal approval of the published wording remains required.

### 5. Privacy controller / launch geography — prior decisions applied

The prior launch decision is worldwide availability wherever Paddle supports sales, excluding sanctioned/regulatorily restricted or otherwise unavailable territories. Tamamizu operates from Thailand. The 2026-09-20 Privacy update now identifies Tamamizu as the controller/operator where applicable law uses that concept and adds general-purpose lawful-basis, service-provider/international-processing, and data-rights disclosures without claiming that one jurisdiction's law applies everywhere.

Final human legal review should still confirm whether any market-specific representative, registration, notice, or other jurisdiction-specific disclosure is required before intentionally marketing into a particular jurisdiction.

### 6. Children / minimum age — decided

The prior decision remains: Tamamizu does **not** set a minimum learning age. Where needed, minors use the service with a parent or legal guardian's permission/supervision, and a guardian may purchase and manage the account. The Privacy Policy already reflects this. Final legal review should confirm whether a specific market requires an additional age threshold or consent flow.

## Refund policy assessment

The current Tamamizu policy promises a full refund within 14 calendar days with no reason and no usage-based waiver. Paddle's current Refund Policy says supplier-provided or mandatory rights can be more generous than Paddle's default baseline, so the Tamamizu promise is not inherently inconsistent with Paddle's published policy. The previously completed real Live refund confirmed that Paddle can operationally execute the promised full refund.

The remaining “refund vs local learning progress” question is not a payment-system blocker: local progress is stored in browser storage and the server-side entitlement/refund path does not clear it. The repo decision remains to retain local progress after access is revoked.

## Operational legal/privacy dependency: XServer logs

XServer's current manual states that error logs are available by domain in Server Panel, with recent history available there and optional server-side saving for longer retention. The exact setting for the Tamamizu domain is account-specific.

Before final legal approval, the human operator should confirm the real Production error-log retention/save setting, because privacy copy should not promise a retention duration that the hosting account does not actually implement.

## Final legal Human Gate

A human should not approve launch until the following are intentionally decided:

1. Public support phone requirement/number, because Paddle's current Seller Handbook asks sellers to publish buyer-support email **and phone** and no public phone number has been approved.
2. Final Terms/refund acceptance mechanism at checkout; the current UI links the policies but does not yet record an explicit acceptance action.
3. Final review of the resulting public Terms, Privacy Policy, Refund Policy, Support page, and purchase acceptance UX.
4. Final GO/NO-GO.

Once those choices are supplied, implementation of the approved wording is ordinary code work and can be completed/tested by AI.
