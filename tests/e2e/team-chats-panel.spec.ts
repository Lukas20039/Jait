import { test, expect } from '@playwright/test'
import type { TeamRoom } from '@jait/shared'
import path from 'node:path'

const shotsDir = path.resolve(__dirname, '../../.jait/shots')

for (const mobile of [false, true]) {
  test(`team chats panel creates multiple rooms from the agent grid (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 })
    const agents = [{ id: 'dev', name: 'Developer', avatar: 'Atlas' }, { id: 'qa', name: 'Reviewer', avatar: 'Nova' }, { id: 'research', name: 'Researcher', avatar: 'Pixel' }]
    const rooms: TeamRoom[] = []
    let failCreate = true
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents } }))
    await page.route('**/api/team-rooms', async route => {
      if (route.request().method() === 'POST') {
        if (failCreate) { failCreate = false; await route.fulfill({ status: 400, json: { error: 'Please retry creation' } }); return }
        const input = route.request().postDataJSON()
        const room = { id: 'room-' + (rooms.length + 1), rootAgentId: input.memberIds[0], name: input.name, memberIds: input.memberIds, projectId: null, projectPath: null, goal: null }
        rooms.unshift(room)
        await route.fulfill({ json: { room } })
      } else await route.fulfill({ json: { rooms } })
    })
    await page.route(/\/api\/team-rooms\/room-\d+$/, route => {
      const room = rooms.find(room => route.request().url().endsWith('/' + room.id))!
      return route.fulfill({ json: { room, members: agents.filter(agent => room.memberIds?.includes(agent.id)), messages: [], deliveries: [] } })
    })
    await page.goto('/team-chat.html?panelFixture=1')
    await expect(page.getByText('Agents graph')).toBeVisible()
    await page.getByRole('button', { name: 'Team Chats', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Team chats panel' })).toBeVisible()
    // Opening the panel leaves the Agents page in place and opens no chat on its own.
    if (!mobile) await expect(page.getByText('Agents graph')).toBeVisible()
    await expect(page.getByTestId('chat-composer')).toHaveCount(0)
    await page.getByRole('complementary', { name: 'Team chats panel' }).getByRole('button', { name: 'New team chat', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Create team chat', exact: true })).toBeDisabled()
    await dialog.getByLabel('Chat name').fill('Implementation')
    await dialog.getByRole('button', { name: 'Developer', exact: true }).click()
    await dialog.getByRole('button', { name: 'Reviewer', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Developer', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('button', { name: 'Researcher', exact: true }).click()
    await dialog.getByRole('button', { name: 'Researcher', exact: true }).click()
    await page.screenshot({ path: path.join(shotsDir, `team-chat-picker-${mobile ? 'mobile' : 'desktop'}.png`) })
    await dialog.getByRole('button', { name: 'Create team chat', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Please retry creation')
    await expect(dialog.getByLabel('Chat name')).toHaveValue('Implementation')
    await dialog.getByRole('button', { name: 'Create team chat', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Implementation', exact: true })).toBeVisible()
    // The selected chat floats above the Agents page instead of replacing it.
    if (!mobile) await expect(page.getByText('Agents graph')).toBeVisible()
    expect(rooms[0].memberIds).toEqual(['dev', 'qa'])
    await page.getByTestId('chat-composer').getByRole('textbox').fill('Unsent implementation draft')
    if (mobile) await page.getByRole('button', { name: 'Back to team chats' }).click()
    await page.getByRole('button', { name: 'New team chat', exact: true }).click()
    await dialog.getByLabel('Chat name').fill('Investigation')
    await dialog.getByLabel('Search agents').fill('Research')
    await dialog.getByRole('button', { name: 'Researcher', exact: true }).click()
    await dialog.getByLabel('Search agents').fill('')
    await dialog.getByRole('button', { name: 'Developer', exact: true }).click()
    await dialog.getByRole('button', { name: 'Create team chat', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Investigation', exact: true })).toBeVisible()
    if (mobile) await page.getByRole('button', { name: 'Back to team chats' }).click()
    const list = page.getByRole('navigation', { name: 'Team chat list' })
    await expect(list.getByRole('button')).toHaveCount(2)
    await list.getByRole('button').filter({ hasText: 'Implementation' }).click()
    await expect(page.getByTestId('chat-composer').getByRole('textbox')).toHaveText('Unsent implementation draft')
    if (!mobile) {
      // The sidebar entry toggles the floating panel without leaving the Agents page.
      await page.getByRole('button', { name: 'Team Chats', exact: true }).click()
      await expect(page.getByRole('complementary', { name: 'Team chats panel' })).toHaveCount(0)
      await expect(page.getByText('Agents graph')).toBeVisible()
      await page.getByRole('button', { name: 'Team Chats', exact: true }).click()
      await expect(list).toBeVisible()
      // The panel's own hide control dismisses it back to the Agents page.
      await page.getByRole('button', { name: 'Hide team chats panel' }).click()
      await expect(page.getByRole('complementary', { name: 'Team chats panel' })).toHaveCount(0)
      await expect(page.getByText('Agents graph')).toBeVisible()
      await page.getByRole('button', { name: 'Team Chats', exact: true }).click()
      await expect(list).toBeVisible()
    }
    await page.screenshot({ path: path.join(shotsDir, `team-chats-${mobile ? 'mobile' : 'desktop'}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Implementation', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}
