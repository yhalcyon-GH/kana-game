import { useState } from 'react'
import { requestMagicLink } from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'

/**
 * Production sign-in entry point — see docs/adr/0001-cross-site-auth-
 * transport.md. Requests a Magic Link for the entered email.
 * request-link.php's response is enumeration-safe by design (always the
 * same generic "check your email" outcome, whether or not the address
 * has an account), so this page never distinguishes success/failure
 * here either -- it always shows the same message once the request has
 * been sent, matching the backend's own contract.
 */
export default function LoginPage() {
  const apiBase = readProductionAuthApiBase()
  const [email, setEmail] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequestLink() {
    if (!email || requesting) return
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
            disabled={!email || requesting}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requesting ? 'Sending…' : 'Send sign-in link'}
          </button>
        </>
      )}
    </div>
  )
}
