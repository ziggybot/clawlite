import { Ollama } from "ollama";
import type { LLMProvider, Message, ToolDef, ToolCall } from "./types.js";
import type { LLMProviderConfig } from "../config.js";

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private client: Ollama;
  private model: string;

  constructor(config: LLMProviderConfig) {
    this.client = new Ollama({ host: config.baseUrl || "http://localhost:11434" });
    this.model = config.model;
  }

  async chat(messages: Message[], tools?: ToolDef[]): Promise<Message> {
    const ollamaMessages = messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool" as const, content: m.content };
      }
      return { role: m.role as "system" | "user" | "assistant", content: m.content };
    });

    const response = await this.client.chat({
      model: this.model,
      messages: ollamaMessages,
      tools: tools
        ? tools.map((t) => ({
            type: "function" as const,
            function: t.function,
          }))
        : undefined,
      stream: false,
    });

    const toolCalls: ToolCall[] | undefined = response.message.tool_calls?.map(
      (tc, i) => ({
        id: `call_${Date.now()}_${i}`,
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      }),
    );

    return {
      role: "assistant",
      content: response.message.content || "",
      tool_calls: toolCalls?.length ? toolCalls : undefined,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}
