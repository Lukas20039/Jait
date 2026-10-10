import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const detached of [false, true]) {
  test(`stream completion preserves ${detached ? 'reading position' : 'bottom position'}`, async ({ page }) => {
    await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/conversation-stream-completion.html')}`)
    const scroll = page.locator('[data-conversation-scroll]')
    await expect(scroll).toBeVisible()
    await page.getByRole('button', { name: 'Start reply' }).click()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Grow reply' }).click()
    await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
    if (detached) {
      await scroll.hover()
      await page.mouse.wheel(0, -450)
      await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeGreaterThan(300)
    }
    const before = await scroll.evaluate(el => el.scrollTop)
    await page.getByRole('button', { name: 'Finish reply' }).click()
    // Wait for virtual rows to measure and all bottom-settle frames to run.
    await page.waitForTimeout(800)
    if (detached) {
      expect(Math.abs(await scroll.evaluate(el => el.scrollTop) - before)).toBeLessThan(2)
    } else {
      expect(await scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
    }
    // An actual new prompt, even with the same text, must still align at the top.
    await page.getByRole('button', { name: 'Send again' }).click()
    const latest = page.getByText('Current prompt', { exact: true }).last()
    await expect.poll(() => latest.evaluate(el => el.getBoundingClientRect().top - el.closest('[data-conversation-scroll]')!.getBoundingClientRect().top)).toBeLessThan(100)
  })
}

for (const mobile of [false, true]) for (const collapse of [false, true]) {
  test(`completion removes empty tail after ${collapse ? 'reply collapses' : 'short reply'} on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/conversation-stream-completion.html')}?${collapse ? 'collapse&' : ''}${mobile ? 'mobile' : ''}`)
    const scroll = page.locator('[data-conversation-scroll]')
    const trailingSpace = () => scroll.evaluate(el => {
      const last = el.querySelector('[data-conv-key]:last-child')!
      const contentEnd = last.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop
      return el.scrollHeight - contentEnd
    })
    await page.getByRole('button', { name: 'Start reply' }).click()
    // Short active replies keep enough space to put the prompt at the top.
    await expect.poll(trailingSpace).toBeGreaterThan(50)
    if (collapse) {
      await page.getByRole('button', { name: 'Grow reply' }).click()
      await expect.poll(trailingSpace).toBeLessThan(25)
    }
    await page.getByRole('button', { name: 'Finish reply' }).click()
    // After completion only the normal 24px transcript inset should remain.
    await expect.poll(trailingSpace).toBeLessThan(25)
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
    const answer = page.getByText('Long streamed answer', { exact: true })
    await expect.poll(() => answer.evaluate(el => {
      const viewport = el.closest('[data-conversation-scroll]')!.getBoundingClientRect()
      return viewport.bottom - el.getBoundingClientRect().bottom
    })).toBeLessThan(25)
    await page.getByRole('button', { name: 'Send again' }).click()
    await expect.poll(trailingSpace).toBeGreaterThan(50)
  })
}

test('short reply completion releases reserve without moving a reader in history', async ({ page }) => {
  await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/conversation-stream-completion.html')}`)
  const scroll = page.locator('[data-conversation-scroll]')
  await page.getByRole('button', { name: 'Start reply' }).click()
  await page.waitForTimeout(150)
  await scroll.hover()
  await page.mouse.wheel(0, -500)
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeGreaterThan(300)
  const before = await scroll.evaluate(el => el.scrollTop)
  await page.getByRole('button', { name: 'Finish reply' }).click()
  await page.waitForTimeout(800)
  expect(Math.abs(await scroll.evaluate(el => el.scrollTop) - before)).toBeLessThan(2)
})
