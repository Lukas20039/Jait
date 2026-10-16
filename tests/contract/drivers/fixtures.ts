/** Production-call adapter only. Rust owns test vectors and expected results. */
import { bm25Rank, bm25Tokens } from '../../../packages/gateway/src/memory/scoring.ts';
import { limitSerializedJson, limitUtf8, serializeBoundedJson } from '../../../packages/gateway/src/lib/bounded-json.ts';
import { resolveCommandTimeoutMs, defaultCommandTimeoutMs, maxCommandTimeoutMs } from '../../../packages/gateway/src/lib/command-timeout.ts';
import { extractSubAgentPayloads, stripSubAgentPayloads } from '../../../packages/gateway/src/lib/sub-agent-persistence.ts';
import { serializePersistedToolCalls } from '../../../packages/gateway/src/lib/persisted-tool-calls.ts';
import { isValidCronExpression } from '../../../packages/gateway/src/scheduler/cron.ts';

// Compact fixture descriptions let Rust request oversize inputs within transport limits.
function materialize(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('$repeat' in value) return value.$repeat[0].repeat(value.$repeat[1]);
  if (Array.isArray(value)) return value.map(materialize);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
}
export async function dispatch(call: any): Promise<unknown> {
  const input = materialize(call.input);
  switch (call.op) {
    case 'fixtures.tokens': return bm25Tokens(input);
    case 'fixtures.rank': return bm25Rank(call.query, input.map((text: string) => ({ item: text, text })));
    case 'fixtures.bounded': {
      if (call.circular) input.self = input;
      return serializeBoundedJson(input, call.max);
    }
    case 'fixtures.utf8': return limitUtf8(input, call.max);
    case 'fixtures.limit-json': return limitSerializedJson(input, call.max);
    case 'fixtures.timeout': {
      const names = ['JAIT_TERMINAL_TIMEOUT_MS', 'JAIT_TERMINAL_TIMEOUT_MAX_MS'];
      for (const name of names) delete process.env[name];
      Object.assign(process.env, call.env ?? {});
      const value = call.special === 'NaN' ? NaN : call.special === 'Infinity' ? Infinity : call.special === '-Infinity' ? -Infinity : input;
      return { resolved: resolveCommandTimeoutMs(value), default: defaultCommandTimeoutMs(), max: maxCommandTimeoutMs() };
    }
    case 'fixtures.extract': return extractSubAgentPayloads(call.raw ? input : JSON.stringify(input));
    case 'fixtures.strip': return stripSubAgentPayloads(call.raw ? input : JSON.stringify(input)) ?? null;
    case 'fixtures.persisted': return serializePersistedToolCalls(call.raw ? input : JSON.stringify(input), call.options);
    case 'fixtures.cron': return isValidCronExpression(input);
    default: throw new Error('unknown fixtures operation');
  }
}
