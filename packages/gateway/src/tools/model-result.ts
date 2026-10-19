import type { ToolResult } from "./contracts.js";

export const MODEL_RESULT_MAX_CHARS = 30_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Preserve the UI result; only the copy entering model history loses display echoes. */
export function projectModelData(data: unknown): unknown {
  if (!record(data)) return data;
  const copy = { ...data };
  delete copy.terminalOutputAnsi;
  // terminalOutput can contain useful output when no canonical output exists.
  if (typeof copy.output === "string") delete copy.terminalOutput;
  return copy;
}

/** Bound structured data without cutting its serialized JSON into invalid fragments. */
function prefix(text: string, length: number): string {
  const value = text.slice(0, length);
  const last = value.charCodeAt(value.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value;
}

export function boundModelData(data: unknown, maxChars = MODEL_RESULT_MAX_CHARS): unknown {
  const serialized = JSON.stringify(data);
  if (!serialized || serialized.length <= maxChars) return data;
  const result: Record<string, unknown> = {
    truncated: true,
    originalChars: serialized.length,
    preview: "",
  };
  // Retain execution/evidence status even when the bulk payload is clipped.
  if (record(data)) for (const key of ["ok", "exitCode", "timedOut", "needsInteraction", "terminalId", "outputOffset", "outputEndOffset"]) {
    if (["boolean", "number", "string"].includes(typeof data[key]) || data[key] === null) result[key] = data[key];
  }
  let lower = 0, upper = serialized.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    result.preview = prefix(serialized, middle);
    if (JSON.stringify(result).length <= maxChars) lower = middle;
    else upper = middle - 1;
  }
  result.preview = prefix(serialized, lower);
  return result;
}

export function serializeToolResultForModel(result: Pick<ToolResult, "ok" | "message" | "data">): string {
  let data = projectModelData(result.data);
  if (record(data)) {
    data = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== result.message));
    if (!Object.keys(data as object).length) data = undefined;
  }
  return JSON.stringify(boundModelData({
    ok: result.ok, message: result.message, ...(data === undefined ? {} : { data }),
  }));
}
