import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Terms &amp; Conditions</h1>

      <p>Last updated: 15 September 2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">About these Terms</h2>
        <p>
          These Terms govern your use of Tamamizu: Hiragana &amp; Katakana, including its free learning content and
          the paid Full Tamamizu content. By using the service or purchasing Full Tamamizu, you agree to these Terms.
          If you do not agree, do not use the service or make a purchase.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Free and paid content</h2>
        <p>
          Hiragana learning content is available without payment. Full Tamamizu is a one-time purchase that unlocks
          additional paid content; it is not a subscription. The base price is USD 5.00. Applicable taxes may be
          included in or added to the price depending on your location, and the final price is shown at Paddle Checkout.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Account and licence</h2>
        <p>
          Full Tamamizu requires an account so the purchase can be recognized. You receive a personal, non-exclusive,
          non-transferable licence to use the paid content. One purchase is for one learner. The same learner may use
          the service on more than one device, but a licence may not be shared with family members or friends. A parent
          or legal guardian may purchase and manage an account for a minor learner.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Acceptable use</h2>
        <p>
          You must not resell, share, copy, distribute, or make unauthorized modifications or derivative distributions
          of the service or paid access. You must not attempt unauthorized access, interfere with the service, bypass
          access controls, or use the service or its systems unlawfully.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Service changes and availability</h2>
        <p>
          Tamamizu may change, maintain, suspend, or discontinue features or content when reasonably necessary. A
          one-time purchase does not guarantee permanent availability of the service. Where practicable, Tamamizu will
          give advance notice of a material discontinuation. Nothing in this section removes a remedy required by law.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Refunds</h2>
        <p>
          Refund eligibility and requests are governed by the <Link to="/refund" className="underline">Refund Policy</Link>.
          In particular, a full refund may be requested within 14 calendar days of the purchase date shown in your Paddle
          confirmation. Account deletion is separate from a refund.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Disclaimers and liability</h2>
        <p>
          Tamamizu is a Japanese-learning aid. It does not guarantee a particular learning outcome, examination result,
          uninterrupted availability, error-free operation, or compatibility with every device and environment. To the
          maximum extent permitted by law, Tamamizu is not liable for indirect, incidental, special, consequential, or
          punitive losses. To the maximum extent permitted by law, Tamamizu&apos;s total liability for a claim relating to
          a purchase is limited to the amount paid for that purchase.
        </p>
        <p>
          Nothing in these Terms limits or excludes liability that cannot lawfully be limited or excluded, including
          rights and remedies that consumer-protection law requires.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Governing law and disputes</h2>
        <p>
          To the extent permitted by applicable law, these Terms and any dispute arising out of or relating to Tamamizu
          are governed by the laws of Thailand, without regard to conflict-of-laws principles.
        </p>
        <p>
          Except where applicable law gives you the right to bring a claim in another court, the courts of Thailand that
          have jurisdiction shall have exclusive jurisdiction over any such dispute.
        </p>
        <p>
          Nothing in these Terms limits or excludes any consumer protection right or remedy that cannot lawfully be
          waived under the law applicable to you.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Changes to these Terms</h2>
        <p>
          Tamamizu may update these Terms prospectively. Updated Terms apply from their published effective date and do
          not reduce rights that already apply to a completed purchase where the law says otherwise.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Contact and related policies</h2>
        <p>
          For questions, contact <Link to="/support" className="underline">Support &amp; Contact</Link>. See also the{' '}
          <Link to="/privacy" className="underline">Privacy Policy</Link> and <Link to="/refund" className="underline">Refund Policy</Link>.
        </p>
      </section>
    </div>
  )
}
