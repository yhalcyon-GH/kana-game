const PROMO_CODE_PATTERN = /^[A-Za-z0-9]{1,32}$/

/**
 * Reads a public Paddle checkout promotion code from the current route query.
 * Promo codes are marketing data only: callers may use the returned value to
 * prefill Paddle Checkout, but must never treat it as entitlement authority.
 */
export function readCheckoutPromoCode(searchParams: URLSearchParams): string | undefined {
  const raw = searchParams.get('promo')
  if (raw === null) return undefined

  const code = raw.trim()
  return PROMO_CODE_PATTERN.test(code) ? code : undefined
}
