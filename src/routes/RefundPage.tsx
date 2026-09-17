import { Link } from 'react-router-dom'

export function RefundPage() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Refund Policy</h1>

      <p>
        This policy applies to one-time purchases of Full Access made through Paddle. It does not apply to any
        future purchase made through another app store or platform, which may have its own refund process.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">14-day full refund</h2>
        <p>
          You may request a full refund within 14 calendar days of the purchase date shown in your Paddle confirmation.
          You do not need to give a reason. Your use of the app or learning progress does not change this right, and
          Tamamizu does not ask you to waive this refund period because you begin using digital content.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">How to request a refund</h2>
        <p>
          Email{' '}
          <a href="mailto:tamamizu.jp@gmail.com" className="underline">
            tamamizu.jp@gmail.com
          </a>
          {' '}with the Paddle order, transaction, or invoice reference, or the email address used for purchase. Do not
          send payment-card details, passwords, Magic Links, or other secrets. You may also contact Paddle&apos;s buyer
          support. Tamamizu aims to acknowledge requests within five business days.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Processing and paid access</h2>
        <p>
          Approved refunds are processed through Paddle. A full refund normally includes applicable taxes as handled
          by Paddle and is returned to the original payment method; the payment provider may take several days to make
          the funds available. While a refund request is pending Paddle approval, paid access remains available. Once
          a full refund is approved, Full Access ends. If a request is rejected, paid access remains active
          or is restored.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">After 14 days and exceptions</h2>
        <p>
          After 14 calendar days, refunds are ordinarily unavailable. Tamamizu may still provide an appropriate remedy
          for duplicate charges, a material and reproducible technical problem that prevents use and cannot be
          resolved, a legal requirement, or another fair exceptional circumstance. These examples do not limit any
          right that cannot lawfully be excluded.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Limits and related requests</h2>
        <p>
          Tamamizu does not ordinarily offer partial refunds. It may decline a request that duplicates a refund already
          completed, duplicates a chargeback for the same transaction, involves payment fraud, or deliberately abuses
          the refund process, subject to applicable law. Account deletion is separate from a refund: deleting an
          account ends paid access but does not itself create a refund, and a refund does not automatically erase local
          learning progress from your device.
        </p>
      </section>

      <p>
        Tamamizu may update this policy prospectively. Updates do not reduce rights that already apply to a completed
        purchase where the law says otherwise. See <Link to="/support" className="underline">Support &amp; Contact</Link>,{' '}
        the <Link to="/privacy" className="underline">Privacy Policy</Link>, and the{' '}
        <Link to="/terms" className="underline">Terms &amp; Conditions</Link>.
      </p>
    </div>
  )
}
