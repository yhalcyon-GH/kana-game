import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js'
import { useEffect, useRef, useState } from 'react'

function readSandboxConfig() {
  if (!import.meta.env.DEV) return { error: 'Sandbox Checkout PoC is available only in development.' }

  const environment = import.meta.env.VITE_PADDLE_ENVIRONMENT?.trim()
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim()
  const priceId = import.meta.env.VITE_PADDLE_PRICE_ID?.trim()
  const missing = [
    !environment && 'VITE_PADDLE_ENVIRONMENT',
    !token && 'VITE_PADDLE_CLIENT_TOKEN',
    !priceId && 'VITE_PADDLE_PRICE_ID',
  ].filter(Boolean)

  if (missing.length) {
    return { error: `Configuration missing: ${missing.join(', ')}. Set these in .env.local and restart the dev server.` }
  }
  if (environment !== 'sandbox') return { error: 'VITE_PADDLE_ENVIRONMENT must be sandbox for this PoC.' }
  if (!token?.startsWith('test_')) {
    return { error: 'VITE_PADDLE_CLIENT_TOKEN must be a sandbox client-side token (test_). Never use an API key.' }
  }
  if (!priceId?.startsWith('pri_')) return { error: 'VITE_PADDLE_PRICE_ID must be a Paddle price ID (pri_).' }
  return { token, priceId }
}

export default function PaddleTestPage() {
  const config = readSandboxConfig()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Ready for a sandbox test purchase.')
  const [events, setEvents] = useState<string[]>([])
  const mounted = useRef(false)
  const opening = useRef(false)
  const checkout = useRef<Paddle | undefined>(undefined)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      checkout.current?.Checkout.close()
    }
  }, [])

  function handleEvent(event: PaddleEventData) {
    if (!mounted.current || !event.name) return
    const name = event.name
    // Display event names only; do not log customer details or payment payloads.
    setEvents((previous) => [...previous.slice(-19), name])
    if (name === 'checkout.completed') {
      // Client events are diagnostic only and MUST NOT grant entitlement.
      // 本番unlockはserver-side verified Paddle webhookをsource of truthとする。
      setStatus('Purchase successful — checkout completed (sandbox). No content has been unlocked.')
    }
  }

  async function openCheckout() {
    if (!import.meta.env.DEV || config.error || !config.token || !config.priceId || opening.current) return
    opening.current = true
    setLoading(true)
    setError('')
    setEvents([])
    setStatus('Loading Paddle Sandbox Checkout…')

    try {
      // The official wrapper loads Paddle.js v2 from Paddle's CDN. On later
      // visits/clicks it uses Paddle.Update for the callback instead of Initialize.
      const paddle = await initializePaddle({
        environment: 'sandbox',
        token: config.token,
        eventCallback: handleEvent,
      })
      if (!mounted.current) return
      // The wrapper may return an instance even when Initialize failed.
      if (!paddle?.Initialized) throw new Error('Paddle did not initialize')
      checkout.current = paddle
      setStatus('Checkout requested. Complete the test payment in the overlay.')
      paddle.Checkout.open({
        settings: { displayMode: 'overlay' },
        items: [{ priceId: config.priceId, quantity: 1 }],
      })
    } catch {
      if (mounted.current) {
        setError('Could not open Paddle Sandbox Checkout. Check the sandbox configuration and network, then reload this page to retry.')
        setStatus('Checkout unavailable.')
      }
    } finally {
      opening.current = false
      if (mounted.current) setLoading(false)
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-5">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Development only · Sandbox Checkout PoC</p>
      <h1 className="text-3xl font-bold">Full Tamamizu</h1>
      <p className="text-xl font-semibold">$4.99 one-time</p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Test payment only. Confirm the product, USD price, quantity and any tax in Paddle before paying.
      </p>
      {(config.error || error) && <p role="alert" className="rounded-lg border border-amber-500 p-4">{config.error || error}</p>}
      <button
        type="button"
        onClick={() => void openCheckout()}
        disabled={Boolean(config.error) || loading}
        className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Open Paddle Sandbox Checkout
      </button>
      <p role="status">{config.error ? 'Checkout disabled until configuration is valid.' : status}</p>
      <section className="flex flex-col gap-2">
        <h2 id="paddle-events-heading" className="text-lg font-semibold">Checkout events</h2>
        <div role="log" aria-labelledby="paddle-events-heading" className="rounded-lg bg-neutral-100 p-4 text-sm dark:bg-neutral-800">
          {events.length ? <ol className="list-inside list-decimal">{events.map((name, index) => <li key={index}>{name}</li>)}</ol> : <p>No events yet.</p>}
        </div>
      </section>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Client events are for this test only. Production unlocks require a server-side verified Paddle webhook.
        This PoC does not grant access or change learning progress.
      </p>
    </div>
  )
}
