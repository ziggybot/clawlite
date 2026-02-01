import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming } from "groq-sdk/resources/chat/completions";
import type { LLMProvider, Message, ToolDef, ToolCall } from "./types.js";
import type { LLMProviderConfig } from "../config.js";

export class GroqProvider implements LLMProvider {
  name = "groq";
  private client: Groq;
  private model: string;

  constructor(config: LLMProviderConfig) {
    this.client = new Groq({
      apiKey: config.apiKey || process.env.GROQ_API_KEY,
    });
    this.model = config.model;
  }

  async chat(messages: Message[], tools?: ToolDef[]): Promise<Message> {
    const groqMessages = messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool" as const,
          content: m.content,
          tool_call_id: m.tool_call_id || "",
        };
      }
      if (m.role === "assistant" && m.tool_calls) {
        return {
          role: "assistant" as const,
          content: m.content || "",
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: tc.function,
          })),
        };
      }
      return {
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      };
    });

    const params: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: groqMessages as ChatCompletionCreateParamsNonStreaming["messages"],
      temperature: 0.7,
      max_tokens: 4096,
    };

    if (tools?.length) {
      params.tools = tools.map((t) => ({
        type: "function" as const,
        function: t.function,
      }));
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];

    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map(
      (tc) => ({
        id: tc.id,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }),
    );

    return {
      role: "assistant",
      content: choice.message.content || "",
      tool_calls: toolCalls?.length ? toolCalls : undefined,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
