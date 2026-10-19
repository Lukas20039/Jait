import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off' })

const startOfToday = new Date()
startOfToday.setHours(0, 0, 0, 0)
const today = startOfToday.getTime()
const yesterday = today - 86_400_000

const base = { encrypted: true, unableToDecrypt: false, pending: false, failed: false, reactions: [] as any[] }

/**
 * WhatsApp exposes stories as one bridged "Status Broadcast" pseudo-chat. The
 * page must detect that room and show a read-only feed instead of the transcript.
 */
async function mount(page: Page, status: boolean) {
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: false,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [
      { id: '!status:test', name: 'WhatsApp Status Broadcast', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Story', status },
      { id: '!bob:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Hello', status: false },
    ],
    messagesByRoom: {
      '!status:test': [
        { ...base, id: '$s1', sender: 'Bob', body: 'Morning run', own: false, timestamp: yesterday + 43_200_000 },
        { ...base, id: '$s2', sender: 'Bob', body: 'Sunset', own: false, timestamp: today + 3_600_000, attachment: { url: 'mxc://test/sunset', name: 'sunset.png', mime: 'image/png', image: true } },
        { ...base, id: '$s3', sender: 'Carol', body: 'New job!', own: false, timestamp: today + 7_200_000 },
      ],
      '!bob:test': [
        { ...base, id: '$b1', sender: 'Bob', body: 'Plain chat message', own: false, timestamp: today + 60_000 },
      ],
    },
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) return route.fulfill({ json: { ok: true } })
    if (url.pathname.endsWith('/media')) {
      return route.fulfill({ json: { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII=' } })
    }
    const roomId = url.searchParams.get('roomId')
    return route.fulfill({ json: { snapshot: { ...snapshot, messages: snapshot.messagesByRoom[roomId as '!status:test'] ?? [], selectedRoomId: roomId } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21status%3Atest', { waitUntil: 'domcontentloaded' })
}

test('Status broadcast room renders a read-only feed instead of a chat', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mount(page, true)

  const feed = page.getByLabel('Status updates')
  await expect(feed).toBeVisible()
  await expect(feed).toContainText('Status updates are read-only')
  // Not a transcript: no composer, no chat bubbles.
  await expect(page.getByRole('log', { name: 'Messages' })).toHaveCount(0)
  await expect(page.getByPlaceholder('Write a message…')).toHaveCount(0)
  await expect(page.locator('[data-message-id]')).toHaveCount(0)
  // Grouped per contact with an update count.
  await expect(page.getByRole('region', { name: 'Status from Bob' })).toContainText('2 updates')
  await expect(page.getByRole('region', { name: 'Status from Carol' })).toContainText('1 update')
  await expect(page.locator('[data-status-update-id="$s1"]')).toContainText('Morning run')
  await expect(page.getByRole('img', { name: 'sunset.png' })).toBeVisible()
  // Each contact's stories carry their own day dividers.
  const bobDividers = page.getByRole('region', { name: 'Status from Bob' }).locator('[data-day-divider]')
  await expect(bobDividers).toHaveCount(2)
  await expect(bobDividers.first()).toHaveText(/yesterday|gestern/i)
  await expect(bobDividers.last()).toHaveText(/today|heute/i)
  await expect(feed.locator('[data-status-update-id="$s2"] [data-day-divider]')).toHaveCount(0)
})

test('Ordinary rooms still render the transcript', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mount(page, true)
  await page.getByRole('group', { name: 'Conversation Bob' }).getByRole('button').first().click()
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Plain chat message')
  await expect(page.getByLabel('Status updates')).toHaveCount(0)
})
