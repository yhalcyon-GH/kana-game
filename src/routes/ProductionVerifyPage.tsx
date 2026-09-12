import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyMagicLinkToken } from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'

type VerifyState =
  | { kind: 'missing-token' }
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'error' }

/**
 * Production Magic Link landing page — see docs/adr/0001-cross-site-
 * auth-transport.md. Rendered at the SAME "#/verify" route the backend
 * hardcodes into every Magic Link URL (server/src/Auth/
 * MagicLinkUrlBuilder.php) — see src/App.tsx for how this component and
 * the dev-only harness's VerifyPage are mutually exclusive at that one
 * route (DEV build vs. production build), never both present at once.
 *
 * Security-critical ordering, matching the dev harness's own VerifyPage:
 * the raw token is read from the URL query string (which — because this
 * app uses HashRouter — lives entirely inside the fragment a browser
 * never sends to a server) and is stripped from the visible URL/history
 * via history.replaceState BEFORE the verify network request is made.
 *
 * Unlike the dev harness, there is no session token to store: the
 * server sets it directly as an HttpOnly cookie this page can never
 * read (see server/auth/verify.php's cookie-mode branch) -- success
 * here means only "the cookie is now set," confirmed by the response
 * carrying the signed-in user's info, never a raw credential.
 */
export default function ProductionVerifyPage() {
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
      const apiBase = readProductionAuthApiBase()
      const result = await verifyMagicLinkToken(apiBase, rawToken)
      setState(result === null ? { kind: 'error' } : { kind: 'success' })
    })()
  }, [searchParams])

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Signing in…</h1>
      {state.kind === 'verifying' && <p role="status">Verifying your sign-in link…</p>}
      {state.kind === 'success' && (
        <>
          <p role="status">You&apos;re signed in.</p>
          <Link to="/account" className="w-full rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white hover:bg-blue-700">
            Go to your account
          </Link>
        </>
      )}
      {(state.kind === 'error' || state.kind === 'missing-token') && (
        <>
          <p role="alert" className="rounded-xl border border-amber-500 p-4 text-center">
            This sign-in link is invalid or has expired.
          </p>
          <Link to="/login" className="w-full rounded-xl border border-neutral-400 px-5 py-3 text-center font-semibold hover:border-blue-500 dark:border-neutral-600">
            Request a new link
          </Link>
        </>
      )}
    </div>
  )
}
