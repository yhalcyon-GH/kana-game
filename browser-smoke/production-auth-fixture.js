const PRODUCTION_API_PATTERN = 'https://tamamizu.giganihongo.com/api/**'

export async function installProductionAuthFixture(page, status = 'active') {
  await page.unroute(PRODUCTION_API_PATTERN)
  await page.route(PRODUCTION_API_PATTERN, async (route) => {
    const { pathname } = new URL(route.request().url())

    if (pathname.endsWith('/auth/me.php')) {
      if (status === 'signed-out') {
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

    await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
  })
}
