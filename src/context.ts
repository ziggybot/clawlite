import type { Message, LLMProvider } from "./llm/types.js";

/**
 * Context window guard.
 * Monitors token usage and compacts (summarises) when threshold is reached.
 */
export class ContextGuard {
  private maxTokens: number;
  private threshold: number;

  constructor(maxTokens: number, compactThreshold: number) {
    this.maxTokens = maxTokens;
    this.threshold = compactThreshold;
  }

  /**
   * Check if messages are approaching the context limit.
   */
  needsCompaction(messages: Message[], provider: LLMProvider): boolean {
    const totalTokens = this.estimateTotal(messages, provider);
    return totalTokens > this.maxTokens * this.threshold;
  }

  /**
   * Compact messages by summarising older conversation turns.
   * Keeps: system message, last N exchanges, and a summary of everything else.
   */
  compact(messages: Message[], provider: LLMProvider): Message[] {
    if (messages.length <= 4) return messages;

    const system = messages[0]?.role === "system" ? messages[0] : null;
    const nonSystem = system ? messages.slice(1) : messages;

    // Keep the last 4 messages (2 exchanges) intact
    const keep = 4;
    const toSummarise = nonSystem.slice(0, -keep);
    const recent = nonSystem.slice(-keep);

    if (toSummarise.length === 0) return messages;

    // Build a summary of older messages
    const summaryParts: string[] = [];
    for (const msg of toSummarise) {
      if (msg.role === "user") {
        summaryParts.push(`User asked: ${truncate(msg.content, 100)}`);
      } else if (msg.role === "assistant") {
        if (msg.tool_calls) {
          const tools = msg.tool_calls.map((tc) => tc.function.name).join(", ");
          summaryParts.push(`Assistant used tools: ${tools}`);
        } else {
          summaryParts.push(`Assistant: ${truncate(msg.content, 100)}`);
        }
      } else if (msg.role === "tool") {
        summaryParts.push(`Tool result: ${truncate(msg.content, 60)}`);
      }
    }

    const summary: Message = {
      role: "user",
      content: `[Context compacted. Summary of earlier conversation:\n${summaryParts.join("\n")}\n]\nContinue from here.`,
    };

    const result: Message[] = [];
    if (system) result.push(system);
    result.push(summary);
    result.push(...recent);

    const before = this.estimateTotal(messages, provider);
    const after = this.estimateTotal(result, provider);
    console.log(
      `  Context compacted: ${before} -> ${after} tokens (${messages.length} -> ${result.length} messages)`,
    );

    return result;
  }

  private estimateTotal(messages: Message[], provider: LLMProvider): number {
    let total = 0;
    for (const msg of messages) {
      total += provider.estimateTokens(msg.content || "");
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += provider.estimateTokens(tc.function.arguments);
        }
      }
    }
    return total;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}
