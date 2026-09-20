import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEntitlement } from '../components/EntitlementContext'
import {
  fetchAuthCapabilities,
  requestLoginCode,
  requestMagicLink,
  verifyLoginCode,
} from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'
import { readCheckoutPromoCode } from '../lib/paddle/promoCode'

const RESEND_COOLDOWN_SECONDS = 60

// Quality gate only, matching server/src/Auth/EmailValidator.php's own doc
// comment: rejects an email that obviously isn't one, before it reaches
// the server -- the server remains the sole authority on validity.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Keeps only digits and caps at 6 characters -- preserves leading zeros
// (this is string state, never parsed as a number) and tolerates paste
// of a longer/formatted value (e.g. "01 23 45" or a trailing newline).
function sanitizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

type Mode =
  | { kind: 'checking-capability' }
  | { kind: 'magic-link' }
  | { kind: 'otp-email' }
  | { kind: 'otp-code'; email: string; challenge: string }

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const INVALID_CODE_ERROR = 'Invalid or expired code. Please request a new code.'

/**
 * Production sign-in entry point — see docs/adr/0001-cross-site-auth-
 * transport.md and docs/superpowers/specs/2026-09-17-email-otp-
 * persistent-login-design.md. Uses the 6-digit email code as the primary
 * flow, detected via GET /api/auth/capabilities.php, falling back to
 * Magic Link whenever that capability is absent/false/unreachable (a
 * GitHub-Pages-ahead-of-backend deploy must never lock anyone out).
 *
 * A wrong/expired code NEVER falls back to Magic Link -- only the
 * capability probe itself decides which flow to show, once, on mount.
 */
export default function LoginPage() {
  const apiBase = readProductionAuthApiBase()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh } = useEntitlement()
  const promoCode = readCheckoutPromoCode(searchParams)
  const accountTarget = promoCode ? `/account?promo=${encodeURIComponent(promoCode)}` : '/account'

  const [mode, setMode] = useState<Mode>(() => (apiBase ? { kind: 'checking-capability' } : { kind: 'magic-link' }))
  const capabilityChecked = useRef(false)

  useEffect(() => {
    if (!apiBase || capabilityChecked.current) return
    capabilityChecked.current = true
    void (async () => {
      const result = await fetchAuthCapabilities(apiBase)
      setMode(result.kind === 'available' && result.emailCodeAuth ? { kind: 'otp-email' } : { kind: 'magic-link' })
    })()
  }, [apiBase])

  if (mode.kind === 'checking-capability') {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p role="status">Loading…</p>
      </div>
    )
  }

  if (mode.kind === 'magic-link') {
    return <MagicLinkSignIn apiBase={apiBase} />
  }

  if (mode.kind === 'otp-email') {
    return (
      <EmailStep
        apiBase={apiBase!}
        onIssued={(email, challenge) => setMode({ kind: 'otp-code', email, challenge })}
      />
    )
  }

  return (
    <CodeStep
      apiBase={apiBase!}
      email={mode.email}
      challenge={mode.challenge}
      onChangeEmail={() => setMode({ kind: 'otp-email' })}
      onChallengeRefreshed={(challenge) => setMode({ kind: 'otp-code', email: mode.email, challenge })}
      onAuthenticated={() => {
        void refresh()
        navigate(accountTarget)
      }}
    />
  )
}

function EmailStep({ apiBase, onIssued }: { apiBase: string; onIssued: (email: string, challenge: string) => void }) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !looksLikeEmail(email)) return
    setSubmitting(true)
    setError(false)
    const result = await requestLoginCode(apiBase, email.trim())
    setSubmitting(false)
    if (result.kind === 'issued') {
      onIssued(email.trim(), result.challenge)
      return
    }
    setError(true)
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Sign in for Full Access</h1>
      <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">
        Enter your email and we&apos;ll send you a 6-digit sign-in code.
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex w-full flex-col gap-4">
        <label className="flex w-full flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-neutral-400 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
            autoComplete="email"
            disabled={submitting}
          />
        </label>
        <button
          type="submit"
          disabled={!looksLikeEmail(email) || submitting}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send code'}
        </button>
        {error && (
          <p role="alert" className="rounded-xl border border-amber-500 p-4 text-center text-sm">
            {GENERIC_ERROR}
          </p>
        )}
      </form>
    </div>
  )
}

function CodeStep({
  apiBase, email, challenge, onChangeEmail, onChallengeRefreshed, onAuthenticated,
}: {
  apiBase: string
  email: string
  challenge: string
  onChangeEmail: () => void
  onChallengeRefreshed: (challenge: string) => void
  onAuthenticated: () => void
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  // Restart the countdown whenever a fresh challenge is issued (initial
  // send AND every successful resend), never on a re-render for any
  // other reason.
  useEffect(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }, [challenge])

  const isCounting = cooldown > 0
  useEffect(() => {
    if (!isCounting) return
    const timer = setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000)
    return () => clearInterval(timer)
  }, [isCounting])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || code.length !== 6) return
    setSubmitting(true)
    setErrorMessage(null)
    const result = await verifyLoginCode(apiBase, challenge, code)
    setSubmitting(false)
    if (result.kind === 'authenticated') {
      onAuthenticated()
      return
    }
    // Never falls back to Magic Link here -- 'invalid' and 'unavailable'
    // both keep the user on this exact OTP code step.
    setCode('')
    setErrorMessage(result.kind === 'invalid' ? INVALID_CODE_ERROR : GENERIC_ERROR)
  }

  async function handleResend() {
    if (resending || cooldown > 0) return
    setResending(true)
    setErrorMessage(null)
    const result = await requestLoginCode(apiBase, email)
    setResending(false)
    if (result.kind === 'issued') {
      setCode('')
      onChallengeRefreshed(result.challenge)
      return
    }
    setErrorMessage(GENERIC_ERROR)
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 overflow-hidden">
      <h1 className="text-2xl font-bold">Enter your code</h1>
      <p className="w-full break-words text-center text-sm text-neutral-600 dark:text-neutral-300">
        We sent a 6-digit code to <span className="font-semibold">{email}</span>.
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex w-full flex-col gap-4">
        <label className="flex w-full flex-col gap-1 text-sm">
          6-digit code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(sanitizeCode(event.target.value))}
            onPaste={(event) => {
              event.preventDefault()
              setCode(sanitizeCode(event.clipboardData.getData('text')))
            }}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-400 px-3 py-2 text-center text-lg tracking-[0.3em] dark:border-neutral-600 dark:bg-neutral-800"
          />
        </label>
        <button
          type="submit"
          disabled={code.length !== 6 || submitting}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Verifying…' : 'Verify code'}
        </button>
        {errorMessage && (
          <p role="alert" className="rounded-xl border border-amber-500 p-4 text-center text-sm">
            {errorMessage}
          </p>
        )}
      </form>
      <div className="flex w-full flex-col gap-2 text-center text-sm">
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resending || cooldown > 0}
          className="font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline dark:text-blue-400"
        >
          {cooldown > 0 ? `Resend code (${cooldown}s)` : resending ? 'Resending…' : 'Resend code'}
        </button>
        <button type="button" onClick={onChangeEmail} className="text-neutral-600 hover:underline dark:text-neutral-300">
          Change email
        </button>
      </div>
    </div>
  )
}

function MagicLinkSignIn({ apiBase }: { apiBase: string | undefined }) {
  const [email, setEmail] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequestLink() {
    if (!apiBase || !email || requesting) return
    setRequesting(true)
    try {
      await requestMagicLink(apiBase, email)
      setRequested(true)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Sign in</h1>

      {requested ? (
        <p role="status" className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center dark:border-neutral-600 dark:bg-neutral-800">
          If an account exists for that email, a sign-in link has been sent. Check your email and open the link on this
          device.
        </p>
      ) : (
        <>
          {!apiBase && (
            <p role="status" className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center dark:border-neutral-600 dark:bg-neutral-800">
              Production Auth testing is disabled in development. Set VITE_PRODUCTION_AUTH_API_BASE_URL to enable it.
            </p>
          )}
          <label className="flex w-full flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-neutral-400 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
              autoComplete="email"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleRequestLink()}
            disabled={!apiBase || !email || requesting}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requesting ? 'Sending…' : 'Send sign-in link'}
          </button>
        </>
      )}
    </div>
  )
}
