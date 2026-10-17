import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { MessengerService } from './messenger-service.js';

function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', import.meta.url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}

describe('Messenger message actions and history', () => {
  it('projects edits and reactions onto their original message', () => {
    const { c, room } = setup();
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: '@alice:test', origin_server_ts: 2, content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { msgtype: 'm.text', body: 'changed' } } } as any);
    room.events.push({ event_id: '$react', type: 'm.reaction', sender: '@alice:test', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } } } as any);
    expect(c.messages('!room:test')).toMatchObject([{ body: 'changed', edited: true, reactions: [{ key: '👍', count: 1, own: true }] }]);
  });
  it('ignores forged edits and redacted reactions', () => {
    const { c, room } = setup();
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: '@other:test', content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { body: 'forged' } } } as any);
    room.events.push({ event_id: '$react', type: 'm.reaction', sender: '@other:test', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } } } as any);
    room.events.push({ event_id: '$redact', type: 'm.room.redaction', content: { redacts: '$react' } } as any);
    expect(c.messages('!room:test')[0]).toMatchObject({ body: 'original', reactions: [] });
  });
  it('retains newly fetched history when more than 2000 events are loaded', async () => {
    const { c, room, message } = setup();
    room.events = Array.from({ length: 2000 }, (_, i) => message('$' + i));
    c.client.doRequest.mockResolvedValue({ chunk: [message('$older')], end: 'page2' });
    await c.earlier('!room:test');
    expect(c.messages('!room:test')[0].id).toBe('$older');
  });
  it('records exhausted history even after subsequent syncs', async () => {
    const { c } = setup();
    c.client.doRequest.mockResolvedValue({ chunk: [], end: 'page1' });
    await c.earlier('!room:test');
    await c.sync({ rooms: { join: { '!room:test': { timeline: { events: [], prev_batch: 'reset' } } } } });
    expect(c.snapshot('!room:test').hasEarlier).toBe(false);
    await c.earlier('!room:test');
    expect(c.client.doRequest).toHaveBeenCalledTimes(1);
  });
  it('rejects edits of another sender and toggles own reactions', async () => {
    const { c, room } = setup();
    room.events[0].sender = '@bob:test';
    await expect(c.command({ action: 'edit', roomId: '!room:test', eventId: '$one', text: 'wrong' })).rejects.toThrow();
    await c.command({ action: 'react', roomId: '!room:test', eventId: '$one', key: '👍' });
    expect(c.client.sendEvent).toHaveBeenCalledWith('!room:test', 'm.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } });
    await c.command({ action: 'react', roomId: '!room:test', eventId: '$one', key: '👍' });
    expect(c.client.redactEvent).toHaveBeenCalledWith('!room:test', '$reaction');
  });
  it('removes a conversation after leaving and forgetting', async () => {
    const { c } = setup();
    await c.command({ action: 'remove', roomId: '!room:test' });
    expect(c.client.leaveRoom).toHaveBeenCalledWith('!room:test');
    expect(c.client.doRequest).toHaveBeenCalledWith('POST', '/_matrix/client/v3/rooms/!room%3Atest/forget', undefined, {});
    expect(c.snapshot().rooms).toEqual([]);
  });
});
