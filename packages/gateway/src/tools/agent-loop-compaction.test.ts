import { afterEach, describe, expect, it, vi } from "vitest";
import { compactActiveTurnHistory, generateLLMConversationSummary, pruneHistory, type AgentMessage, type LLMConfig } from "./agent-loop.js";

const llm: LLMConfig = { backend: "ollama", openaiBaseUrl: "http://fixture.invalid/v1", openaiApiKey: "fixture", openaiModel: "fixture", contextWindow: 8000 };
afterEach(() => vi.unstubAllGlobals());

function model() {
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const input = JSON.stringify(body.messages);
    return Response.json({ message: { content: input.includes("scope-expires-at-18:00") ? "Keep scope-expires-at-18:00; tests passed; next verify rollback." : "tests passed; next verify rollback." } });
  }));
  return requests;
}

describe("context checkpoint handoff", () => {
  it("carries prior summaries through repeated real pruning", async () => {
    const requests = model();
    const history: AgentMessage[] = [
      { role: "system", content: "base instructions" },
      { role: "system", content: "[conversation-summary]scope-expires-at-18:00[/conversation-summary]" },
      { role: "user", content: "Prepare rollback " + "x".repeat(10000) },
      { role: "assistant", content: "Tests passed " + "x".repeat(10000) },
      { role: "user", content: "Verify changes" },
    ];
    for (let pass = 0; pass < 2; pass++) {
      expect(await pruneHistory(history, 2000, [], { summaryGenerator: removed => generateLLMConversationSummary(removed, llm) })).toBe(true);
      expect(history.filter(m => m.content.includes("[conversation-summary]")).length).toBe(1);
      expect(history.find(m => m.content.includes("[conversation-summary]"))?.content).toContain("scope-expires-at-18:00");
      history.push({ role: "assistant", content: "More evidence " + "y".repeat(15000) }, { role: "user", content: "Continue verification" });
    }
    expect(requests).toHaveLength(2);
  });

  it("summarizes outcomes without replaying private thinking and preserves tool-result tails", async () => {
    const requests = model();
    await generateLLMConversationSummary([
      { role: "assistant", content: "Run verification", thinking: "unnecessary-internal-narrative" },
      { role: "tool", content: "header " + "x".repeat(4000) + " FINAL: 7 passed", tool_call_id: "c1" },
    ], llm);
    const input = JSON.stringify(requests[0].messages);
    expect(input).not.toContain("unnecessary-internal-narrative");
    expect(input).toContain("FINAL: 7 passed");
    expect(requests[0].options.num_predict).toBe(2048);
    expect(input).not.toContain("Use this EXACT format");
  });

  it("does not modify history when summarization is cancelled", async () => {
    const abort = new AbortController();
    const history: AgentMessage[] = [{ role: "system", content: "base" }, { role: "user", content: "old task" }, { role: "assistant", content: "x".repeat(18000) }, { role: "user", content: "current task" }];
    const before = structuredClone(history);
    vi.stubGlobal("fetch", vi.fn(async () => { abort.abort(); throw new DOMException("Aborted", "AbortError"); }));
    await expect(pruneHistory(history, 2000, [], { summaryGenerator: removed => generateLLMConversationSummary(removed, llm, abort.signal) })).rejects.toThrow();
    expect(history).toEqual(before);
  });
});

describe("active turn handoff", () => {
  function history(): AgentMessage[] {
    return [
      { role: "system", content: "base instructions" },
      { role: "user", content: "Verify authorized targets; preserve evidence" },
      { role: "system", content: "[active-turn-summary]scope-expires-at-18:00[/active-turn-summary]" },
      ...Array.from({ length: 38 }, (_, i): AgentMessage[] => [
        { role: "assistant", content: `Evidence ${i}`, tool_calls: [{ id: `c${i}`, type: "function", function: { name: "file_read", arguments: "{}" } }] },
        { role: "tool", tool_call_id: `c${i}`, content: `result-${i} ` + "x".repeat(400) },
      ]).flat(),
    ];
  }
  it("summarizes the entire removed prefix and previous checkpoint, retaining recent pairs", async () => {
    const messages = history();
    const original = structuredClone(messages);
    let source: AgentMessage[] = [];
    expect(await compactActiveTurnHistory(messages, [], 1000, { summaryGenerator: async removed => {
      source = removed;
      expect(messages).toEqual(original);
      return "[conversation-summary]Scope and progress preserved; next verify rollback.[/conversation-summary]";
    } })).toBe(true);
    expect(source.some(m => m.content.includes("scope-expires-at-18:00"))).toBe(true);
    expect(source.some(m => m.content.startsWith("result-0 "))).toBe(true);
    expect(source.filter(m => m.role === "tool")).toHaveLength(30);
    expect(messages[1]).toEqual(original[1]);
    expect(messages[2].content).toContain("[active-turn-summary]");
    expect(messages.slice(3)).toEqual(original.slice(-16));
  });
  it("leaves the active turn intact when generation fails", async () => {
    const messages = history();
    const original = structuredClone(messages);
    await expect(compactActiveTurnHistory(messages, [], 1000, { summaryGenerator: async () => { throw new Error("cancelled"); } })).rejects.toThrow("cancelled");
    expect(messages).toEqual(original);
  });
  it("preserves the old checkpoint on model failure or truncated output", async () => {
    for (const response of [new Response("unavailable", { status: 503 }), Response.json({ message: { content: "incomplete" }, done_reason: "length" })]) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      const result = await generateLLMConversationSummary(history(), llm);
      expect(result).toContain("scope-expires-at-18:00");
      expect(result).toContain("Degraded checkpoint");
      expect(result).not.toContain("incomplete");
    }
  });
});
