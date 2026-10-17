import './tailruntime.ts';
/** Interactive fixture entrypoint. No gateway assertions are evaluated here. */
import { readLine, emit } from './tailtransport.ts';
const request = readLine();
const log = console.log;
console.log = (...args: unknown[]) => console.error(...args);
try {
  const { dispatch } = await import('./tailstatic.ts');
  await dispatch(request);
  emit({ event: 'complete' });
  process.exit(0);
} catch (error) {
  emit({ event: 'error', message: String(error instanceof Error ? (error.stack ?? error.message) : error) });
  process.exit(1);
} finally {
  console.log = log;
}
