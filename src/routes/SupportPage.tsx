import { Link } from 'react-router-dom'

export function SupportPage() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Support &amp; Contact</h1>

      <p>
        For Tamamizu support, contact us at{' '}
        <a href="mailto:tamamizu.jp@gmail.com" className="underline">
          tamamizu.jp@gmail.com
        </a>
        {' '}or by phone at{' '}
        <a href="tel:+66821034511" className="underline">
          +66 82 103 4511
        </a>
        .
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Purchases through Paddle</h2>
        <p>
          Paddle.com is the Merchant of Record for purchases made through Paddle Checkout and handles payment,
          transaction-tax, order-support, and return processing for those orders. You can still contact Tamamizu
          for Tamamizu access, account, refund-policy, and product-support questions.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">What we can help with</h2>
        <p>
          Contact us for a purchase or refund question, account or access problem, account-deletion request, privacy
          question, or reproducible technical issue. We aim to acknowledge support requests within five business days.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Information to include</h2>
        <p>
          Describe the issue and, where relevant, include the Paddle order, transaction, or invoice reference, or the
          email address used for the purchase. Do not send payment-card details, passwords, Magic Links, session
          credentials, API keys, or other secrets by email.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Related policies</h2>
        <p>
          See the <Link to="/terms" className="underline">Terms &amp; Conditions</Link> for service use, the{' '}
          <Link to="/refund" className="underline">Refund Policy</Link> for refund eligibility, and the{' '}
          <Link to="/privacy" className="underline">Privacy Policy</Link> for data and account-deletion information.
        </p>
      </section>
    </div>
  )
}
