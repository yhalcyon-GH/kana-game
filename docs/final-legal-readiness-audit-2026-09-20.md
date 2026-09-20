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

### 1. Supplier/operator identity

Paddle's current Seller Handbook says sellers should include the company name or sole proprietor's brand in Terms, with the legal name preferred for sole proprietors. UK/EU privacy transparency rules can also require the identity and contact details of the controller.

Current Tamamizu pages identify the operator as the public GitHub handle `yhalcyon-GH` and provide the support email, but do not publish the operator's legal personal/business name.

**Human decision required:** decide what legally appropriate operator/supplier identity should be published. Do not put a private identity into GitHub until the operator intentionally chooses to make that information public.

### 2. Support telephone/contact requirements

Paddle's Seller Handbook currently says buyer support details should include email and phone number. Tamamizu currently publishes an email address but no phone number.

**Human decision required:** confirm with Paddle/current account requirements whether a telephone number must be publicly displayed for this seller/account, and if so choose the public support number to publish. Do not invent or expose a private phone number.

### 3. Explicit acceptance of supplier Terms / Refund Policy

The current Account purchase surface says “By continuing, review…” and links the policies. Paddle's Seller Handbook says the buyer should accept the seller's Terms and refund policy before purchase, and Paddle Buyer Terms treat the Supplier Agreement as part of the purchase relationship.

**Human legal approval required:** approve the final click-wrap wording/mechanism (for example, wording tied directly to selecting “Buy Full Access”, or a checkbox if counsel/Paddle requires one). This changes the legal acceptance mechanism, so it is not an AI-only copy edit.

### 4. Paddle Merchant-of-Record wording in Tamamizu Terms

Paddle's current materials describe Paddle as the authorised reseller / Merchant of Record for the transaction, while the supplier licenses/supports the product. Tamamizu's current Terms mention Paddle Checkout and the Refund Policy but do not plainly state this transaction-role split.

**Human legal approval required:** approve adding a concise Merchant-of-Record paragraph to the Terms and Support copy, consistent with the current Paddle agreement/account.

### 5. Privacy controller identity, lawful bases, rights, recipients/transfers

If UK GDPR / EU GDPR applies to the intended market, current official guidance calls for privacy information including the controller's identity/contact details, purposes and lawful bases, rights, retention, recipients, and transfer information where applicable.

Tamamizu already describes many purposes, categories, service providers, retention criteria, and deletion contact, but it does not currently provide:
- a legal/controller identity beyond the public handle;
- a section explicitly stating lawful bases;
- a consolidated data-subject-rights section;
- a consolidated international-transfer/recipient explanation.

**Human decision required:** decide the launch markets and obtain final legal review of whether UK/EU GDPR, Thailand PDPA, or other jurisdiction-specific additions/representatives are required. Once the applicable scope and public operator identity are decided, the remaining wording can be implemented mechanically.

### 6. Children / minimum age

The Privacy Policy currently says Tamamizu does not set a minimum learning age and permits guardian-managed use. Because signed-in accounts process an email address, selling/serving minors can trigger jurisdiction-specific consent/capacity/privacy rules.

**Human decision required:** decide whether the launch should:
- remain available to minors with guardian involvement;
- set a minimum account/purchase age;
- or restrict particular markets/flows.

Do not infer the answer from the educational nature of the app.

## Refund policy assessment

The current Tamamizu policy promises a full refund within 14 calendar days with no reason and no usage-based waiver. Paddle's current Refund Policy says supplier-provided or mandatory rights can be more generous than Paddle's default baseline, so the Tamamizu promise is not inherently inconsistent with Paddle's published policy. The previously completed real Live refund confirmed that Paddle can operationally execute the promised full refund.

The remaining “refund vs local learning progress” question is not a payment-system blocker: local progress is stored in browser storage and the server-side entitlement/refund path does not clear it. The repo decision remains to retain local progress after access is revoked.

## Operational legal/privacy dependency: XServer logs

XServer's current manual states that error logs are available by domain in Server Panel, with recent history available there and optional server-side saving for longer retention. The exact setting for the Tamamizu domain is account-specific.

Before final legal approval, the human operator should confirm the real Production error-log retention/save setting, because privacy copy should not promise a retention duration that the hosting account does not actually implement.

## Final legal Human Gate

A human should not approve launch until the following are intentionally decided:

1. Public legal/operator identity.
2. Public support phone requirement/number, if required.
3. Final Terms/refund acceptance mechanism at checkout.
4. Merchant-of-Record wording.
5. Intended geographic/age scope and corresponding privacy/controller disclosures.
6. Final review of the resulting public Terms, Privacy Policy, Refund Policy, and Support page.

Once those choices are supplied, implementation of the approved wording is ordinary code work and can be completed/tested by AI.
