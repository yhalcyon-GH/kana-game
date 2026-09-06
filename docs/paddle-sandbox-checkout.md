# Paddle Sandbox Checkout PoC

Goal: verify that the existing **Full Tamamizu — USD 4.99 one-time** price
can be purchased through Paddle Sandbox overlay checkout. This development-only
page does not change learning, progress, content access, analytics or feedback.
It adds no accounts, database, entitlement, webhook, refunds or live payments.

## Local setup

1. In this branch's working directory, run `npm ci`.
2. Create or edit the gitignored `.env.local` in that same directory (a separate
   worktree does not inherit another checkout's `.env.local`). Add:

   ```dotenv
   VITE_PADDLE_ENVIRONMENT=sandbox
   VITE_PADDLE_CLIENT_TOKEN=
   VITE_PADDLE_PRICE_ID=
   ```

3. Fill the token from **Sandbox → Developer tools → Authentication →
   Client-side tokens** (`test_…`), and the existing product's **Price ID**
   (`pri_…`). Use the price for Full Tamamizu, USD 4.99, with no billing cycle.
   The app does not create or change Paddle catalog data.
4. Under **Sandbox → Checkout → Checkout settings → Default payment link**,
   set the local checkout page URL. Sandbox accepts localhost without website
   approval. Match the host/port being used for the test.
5. Run `npm run dev` and open
   `http://localhost:5173/kana-game/#/paddle-test` (adjust the port if Vite reports
   another one). The app uses HashRouter. Dismiss the existing introduction if
   this is a fresh browser profile. Restart Vite after editing `.env.local`.

`VITE_*` values are public browser configuration, not a secret store. Never put
a Paddle API secret/API key here, commit actual tokens/price IDs, or configure
these Sandbox variables in production/deployment settings. The page rejects
non-sandbox environments and non-`test_` client tokens. Production builds omit
the route, the dynamic page import, its configuration values and the Paddle SDK;
the test URL resolves to Page not found. There is no normal navigation entry.

## Human Sandbox browser verification

1. With token or price missing, check the named configuration message and
   disabled **Open Paddle Sandbox Checkout** button.
2. With valid local configuration, click the button. Confirm Paddle's **Test
   Mode** overlay, **Full Tamamizu**, **USD 4.99**, **quantity 1**, and **one-time**
   purchase (no recurring billing). The page's price label is the expected
   catalog price; Paddle controls the actual amount. Inspect tax, currency and
   total before paying. If they differ from the expected USD 4.99 offer, stop
   and check the configured price and Sandbox catalog/tax/currency settings.
3. Use Paddle's test card `4242 4242 4242 4242`, any future expiry date and
   security code `100`, with test customer details. Submit the Sandbox payment.
4. Confirm Paddle's success screen, then close the overlay. The page must show
   **Purchase successful — checkout completed (sandbox)** and
   `checkout.completed` in **Checkout events**. Completion remains visible
   after `checkout.closed`. The log contains the last 20 event names only;
   it does not display customer/payment payloads or write events to storage.
5. In the Sandbox dashboard's **Transactions**, confirm the matching completed
   transaction, price, quantity, currency and amount. Record the tested commit
   SHA and result in the PR. SDK mocks cannot prove this real payment result.
6. Cancel and reopen once; navigate away and back once; confirm checkout can
   open again and the page receives events. A new attempt clears the prior
   success message. If SDK loading/initialization fails, check configuration,
   default payment link and network access to Paddle, then reload the page.
7. Run `npm run build` and `npm run preview`, then open
   `http://localhost:4173/kana-game/#/paddle-test`: expect **Page not found** and
   no Paddle script/network request.

Client events are diagnostic only and must never grant entitlement.
本番unlockはserver-side verified Paddle webhookをsource of truthとする。
Server-side verification and unlocking are outside this PoC.

## Automated verification

- `npm test -- src/routes/PaddleTestPage.test.tsx src/App.paddle.test.tsx`
  mocks the external SDK and checks configuration gates, Sandbox initialization,
  the configured price/quantity, events, errors, double clicks, unmount and revisit.
- `npm run verify` runs the repository's complete deterministic checks.
- `npm run test:browser-smoke -- browser-smoke/paddle-production.e2e.js`
  checks the production route and absence of Paddle loading in a real browser.

## Official references checked 2026-09-06

- [Paddle.js quickstart](https://developer.paddle.com/paddle-js/about/)
- [Official npm wrapper](https://github.com/PaddleHQ/paddle-js-wrapper)
  (`@paddle/paddle-js` 1.6.5 loads `https://cdn.paddle.com/paddle/v2/paddle.js`;
  the wrapper's version number is separate from Paddle.js v2).
- [Initialize and callback lifecycle](https://developer.paddle.com/paddle-js/methods/paddle-initialize/)
- [Checkout.open parameters](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/)
- [checkout.completed](https://developer.paddle.com/paddle-js/events/checkout-completed/)
- [Overlay setup and troubleshooting](https://developer.paddle.com/build/checkout/build-overlay-checkout/)
