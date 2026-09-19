const PRODUCTION_API_PATTERN = 'https://tamamizu.giganihongo.com/api/**'

// The OTP code that installProductionAuthFixture's verify-code.php mock
// treats as correct -- any other 6-digit value is reported as invalid,
// matching verify-code.php's own generic "invalid or expired" contract.
export const BROWSER_SMOKE_VALID_CODE = '012345'

export async function installProductionAuthFixture(page, status = 'active', options = {}) {
  const emailCodeAuth = options.emailCodeAuth ?? true
  // A real successful /auth/verify-code.php call sets the session cookie
  // server-side, so every /auth/me.php call afterwards -- including the
  // refresh() LoginPage triggers on its own onAuthenticated callback --
  // resolves as the newly authenticated browser-smoke user, regardless
  // of the `status` this fixture was installed with (e.g. 'signed-out',
  // to exercise the pre-login screens). Without this, /auth/me.php would
  // keep reporting the ORIGINAL install-time status forever, and the
  // post-login Account page would never actually show as signed in.
  let otpAuthenticated = false
  await page.unroute(PRODUCTION_API_PATTERN)
  await page.route(PRODUCTION_API_PATTERN, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())

    if (pathname.endsWith('/auth/me.php')) {
      if (otpAuthenticated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user_id: 'browser-smoke-user', email_normalized: 'browser-smoke@example.test' }),
        })
      } else if (status === 'signed-out') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
      } else if (status === 'unavailable') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user_id: 'browser-smoke-user', email_normalized: 'browser-smoke@example.test' }),
        })
      }
      return
    }

    if (pathname.endsWith('/entitlement-me.php')) {
      await route.fulfill({
        status: status === 'unavailable' ? 503 : 200,
        contentType: 'application/json',
        body: status === 'unavailable' ? '{}' : JSON.stringify({ active: status === 'active' }),
      })
      return
    }

    if (pathname.endsWith('/auth/capabilities.php')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email_code_auth: emailCodeAuth }) })
      return
    }

    if (pathname.endsWith('/auth/request-code.php')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', challenge: 'browser-smoke-challenge' }),
      })
      return
    }

    if (pathname.endsWith('/auth/verify-code.php')) {
      const body = JSON.parse(request.postData() || '{}')
      if (body.code !== BROWSER_SMOKE_VALID_CODE) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid or expired code' }) })
        return
      }
      otpAuthenticated = true
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { user_id: 'browser-smoke-user', email_normalized: 'browser-smoke@example.test' } }),
      })
      return
    }

    if (pathname.endsWith('/auth/sign-out-others.php')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', revoked: 1 }) })
      return
    }

    await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
  })
}
