import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off' })
async function mount(page: Page) {
  const calls: any[] = []
  const base = { timestamp: 1, encrypted: true, unableToDecrypt: false, pending: false, failed: false }
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: true,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [{ id: '!room:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Hello' }],
    messages: [
      { ...base, id: '$one', sender: 'Bob', body: 'Incoming message', own: false, reactions: [{ key: '❤️', count: 1, own: false, senders: ['Bob'] }] },
      { ...base, id: '$two', sender: 'Alice', body: 'My message', own: true, reactions: [] },
      { ...base, id: '$image', sender: 'Bob', body: 'photo.png', own: false, attachment: { url: 'mxc://test/photo', name: 'photo.png', mime: 'image/png', image: true } },
    ],
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) {
      const cmd = route.request().postDataJSON(); calls.push(cmd)
      if (cmd.action === 'earlier') {
        snapshot.messages.unshift({ ...base, id: '$old', sender: 'Bob', body: 'Older message', own: false, reactions: [] } as any)
        snapshot.hasEarlier = false
      }
      if (cmd.action === 'edit') Object.assign(snapshot.messages.find(m => m.id === cmd.eventId)!, { body: cmd.text, edited: true })
      if (cmd.action === 'react') {
        const m = snapshot.messages.find(m => m.id === cmd.eventId)!
        const own = m.reactions?.some(r => r.key === cmd.key && r.own)
        m.reactions = own ? [] : [{ key: cmd.key, count: 1, own: true, senders: ['You'] }]
      }
      if (cmd.action === 'remove') snapshot.rooms = []
      return route.fulfill({ json: { ok: true } })
    }
    if (url.pathname.endsWith('/media')) return route.fulfill({ json: { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII=' } })
    return route.fulfill({ json: { snapshot: { ...snapshot, selectedRoomId: url.searchParams.get('roomId') } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest')
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Incoming message')
  return calls
}

for (const width of [1280, 390, 320]) {
  test('Messenger bubbles and inline images at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount(page)
    const incoming = page.locator('[data-message-id="$one"] [data-messenger-bubble]')
    const own = page.locator('[data-message-id="$two"] [data-messenger-bubble]')
    await expect(incoming).toBeVisible()
    await expect(own).toBeVisible()
    expect(await incoming.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await expect(page.getByRole('img', { name: 'photo.png' })).toBeVisible()
    await expect(page.getByRole('button', { name: /forward/i })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-bubbles-' + width + '.png') })
  })
}

test('React, remove reaction, and edit own message', async ({ page }) => {
  const calls = await mount(page)
  const own = page.locator('[data-message-id="$two"]')
  await own.getByRole('button', { name: 'React to message' }).click()
  await page.getByRole('menuitem', { name: '👍', exact: true }).click()
  await expect(own.getByRole('button', { name: '👍 1' })).toHaveAttribute('aria-pressed', 'true')
  await own.getByRole('button', { name: '👍 1' }).click()
  await expect(own.getByRole('button', { name: '👍 1' })).toHaveCount(0)
  await own.getByRole('button', { name: 'Message options' }).click()
  await page.getByRole('menuitem', { name: 'Edit message' }).click()
  await own.getByRole('textbox', { name: 'Edit message' }).fill('Updated message')
  await own.getByRole('button', { name: 'Save' }).click()
  await expect(own).toContainText('Updated message')
  await expect(own).toContainText('Edited')
  expect(calls.filter(c => c.action === 'react')).toHaveLength(2)
  expect(calls).toContainEqual({ action: 'edit', roomId: '!room:test', eventId: '$two', text: 'Updated message' })
})

test('Chat options remove conversation with clear confirmation', async ({ page }) => {
  const calls = await mount(page)
  await page.getByRole('button', { name: 'Conversation options', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /Mark as unread/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Search messages/ })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Remove conversation' }).click()
  await expect(page.getByRole('dialog')).toContainText('leave')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toHaveCount(0)
  expect(calls).toContainEqual({ action: 'remove', roomId: '!room:test' })
})

test('History loads older messages and stops at exhaustion', async ({ page }) => {
  const calls = await mount(page)
  const log = page.getByRole('log', { name: 'Messages' })
  await log.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
  await expect(log).toContainText('Older message')
  await expect(page.getByRole('button', { name: 'Load earlier messages' })).toHaveCount(0)
  expect(calls.filter(c => c.action === 'earlier')).toHaveLength(1)
})

test('Failed edits keep the text available for retry', async ({ page }) => {
  await mount(page)
  await page.route('**/api/messenger/command', route => route.request().postDataJSON().action === 'edit'
    ? route.fulfill({ status: 400, json: { error: 'Rejected' } }) : route.fallback())
  const own = page.locator('[data-message-id="$two"]')
  await own.getByRole('button', { name: 'Message options' }).click()
  await page.getByRole('menuitem', { name: 'Edit message' }).click()
  await own.getByRole('textbox', { name: 'Edit message' }).fill('Keep my edit')
  await own.getByRole('button', { name: 'Save' }).click()
  await expect(own.getByRole('alert')).toContainText('Could not update')
  await expect(own.getByRole('textbox', { name: 'Edit message' })).toHaveValue('Keep my edit')
})

test('Search messages from the mobile chat menu reveals the search field', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mount(page)
  await page.getByRole('button', { name: 'Conversation options', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Search messages', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Search loaded messages' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search loaded messages' })).toBeFocused()
})
