import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyMagicLinkToken } from '../lib/auth/authClient'
import { inMemorySessionTransport } from '../lib/auth/sessionTransport'
import { readAuthApiBase } from '../lib/auth/authApiBase'

type VerifyState =
  | { kind: 'missing-token' }
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'error' }

/**
 * DEV-ONLY. Not a production login route — see docs/adr/0001-cross-
 * site-auth-transport.md: the production browser session transport is
 * a separate, later decision. This route exists only so the dev-only
 * /account-test harness can exercise the full request-link -> verify
 * -> session flow against a real deployed backend.
 *
 * Security-critical ordering: the raw token is read from the URL
 * query string (which — because this app uses HashRouter — lives
 * entirely inside the fragment a browser never sends to a server) and
 * is stripped from the visible URL/history via history.replaceState
 * BEFORE the verify network request is made, not after. The session
 * token this produces is stored ONLY in inMemorySessionTransport —
 * never localStorage/sessionStorage, never placed back in a URL.
 */
export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<VerifyState>({ kind: 'verifying' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const rawToken = searchParams.get('token')
    if (!rawToken) {
      setState({ kind: 'missing-token' })
      return
    }

    // Strip the token from the visible URL/history FIRST — before the
    // async verify() call is even awaited — so it never lingers in
    // history even if the network request is slow or fails.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash.split('?')[0]}`)

    void (async () => {
      const apiBase = readAuthApiBase()
      if (!apiBase) {
        setState({ kind: 'error' })
        return
      }

      const result = await verifyMagicLinkToken(apiBase, rawToken)
      if (result === null) {
        setState({ kind: 'error' })
        return
      }

      inMemorySessionTransport.setToken(result.sessionToken)
      setState({ kind: 'success' })
    })()
  }, [searchParams])

  return (
    <div className="flex w-full max-w-xl flex-col gap-5">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Development only · Account Test harness</p>
      <h1 className="text-2xl font-bold">Verifying sign-in link…</h1>
      {state.kind === 'verifying' && <p role="status">Verifying your sign-in link…</p>}
      {state.kind === 'success' && (
        <>
          <p role="status">Signed in. You can return to the test harness.</p>
          <Link to="/account-test" className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            Back to Account Test
          </Link>
        </>
      )}
      {(state.kind === 'error' || state.kind === 'missing-token') && (
        <>
          <p role="alert" className="rounded-lg border border-amber-500 p-4">
            This sign-in link is invalid or has expired. Request a new one from the Account Test harness.
          </p>
          <Link to="/account-test" className="self-start rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600">
            Back to Account Test
          </Link>
        </>
      )}
    </div>
  )
}
