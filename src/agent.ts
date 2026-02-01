import type { LLMProvider, Message, ToolDef } from "./llm/types.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ContextGuard } from "./context.js";
import type { SessionStore } from "./memory/session.js";
import type { LaneManager } from "./lane.js";
import type { SkillLoader } from "./tools/skills.js";

const MAX_TURNS = 15;

const SYSTEM_PROMPT = `You are a helpful coding assistant running locally. You have access to tools for shell commands and file operations.

Rules:
- Be concise. Short answers save context tokens.
- Use tools when needed, don't guess file contents.
- One tool call at a time for reliability.
- If a command fails, explain why and suggest alternatives.
- Ask for clarification if the request is ambiguous.`;

export interface AgentConfig {
  provider: LLMProvider;
  fallback?: LLMProvider;
  tools: ToolRegistry;
  context: ContextGuard;
  session: SessionStore;
  lanes: LaneManager;
  skills?: SkillLoader;
  onToolApproval?: (command: string) => Promise<boolean>;
  onOutput?: (text: string) => void;
}

export class Agent {
  private provider: LLMProvider;
  private fallback?: LLMProvider;
  private tools: ToolRegistry;
  private context: ContextGuard;
  private session: SessionStore;
  private lanes: LaneManager;
  private skills?: SkillLoader;
  private messages: Message[] = [];
  private onOutput: (text: string) => void;

  constructor(config: AgentConfig) {
    this.provider = config.provider;
    this.fallback = config.fallback;
    this.tools = config.tools;
    this.context = config.context;
    this.session = config.session;
    this.lanes = config.lanes;
    this.skills = config.skills;
    this.onOutput = config.onOutput || console.log;

    this.messages.push({ role: "system", content: SYSTEM_PROMPT });
  }

  async handleMessage(userInput: string): Promise<string> {
    return this.lanes.run(async () => {
      // Inject relevant skills into system prompt dynamically
      if (this.skills) {
        const skillPrompt = this.skills.buildPrompt(userInput);
        if (skillPrompt && this.messages[0]?.role === "system") {
          this.messages[0] = {
            role: "system",
            content: SYSTEM_PROMPT + skillPrompt,
          };
        }
      }

      const userMsg: Message = { role: "user", content: userInput };
      this.messages.push(userMsg);
      this.session.append(userMsg);

      let turns = 0;
      let activeProvider = this.provider;

      while (turns < MAX_TURNS) {
        turns++;

        // Context guard: compact if needed
        if (this.context.needsCompaction(this.messages, activeProvider)) {
          this.messages = this.context.compact(this.messages, activeProvider);
        }

        // Pick which tools to send (all for now, could be dynamic)
        const toolDefs = this.tools.getDefinitions();

        // LLM call with fallback
        let response: Message;
        try {
          response = await activeProvider.chat(this.messages, toolDefs);
        } catch (e) {
          if (this.fallback && activeProvider !== this.fallback) {
            this.onOutput(
              `  [${activeProvider.name} failed, falling back to ${this.fallback.name}]`,
            );
            activeProvider = this.fallback;
            try {
              response = await activeProvider.chat(this.messages, toolDefs);
            } catch (e2) {
              const errMsg = `Both providers failed. ${activeProvider.name}: ${e2}`;
              return errMsg;
            }
          } else {
            return `LLM error: ${e}`;
          }
        }

        this.messages.push(response);
        this.session.append(response);

        // If no tool calls, return the text response
        if (!response.tool_calls || response.tool_calls.length === 0) {
          return response.content;
        }

        // Execute tool calls (one at a time for small LLM reliability)
        for (const toolCall of response.tool_calls) {
          const tool = this.tools.get(toolCall.function.name);

          if (!tool) {
            const errResult: Message = {
              role: "tool",
              content: `Error: unknown tool "${toolCall.function.name}"`,
              tool_call_id: toolCall.id,
            };
            this.messages.push(errResult);
            this.session.append(errResult);
            continue;
          }

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            const errResult: Message = {
              role: "tool",
              content: `Error: invalid JSON in tool arguments: ${toolCall.function.arguments}`,
              tool_call_id: toolCall.id,
            };
            this.messages.push(errResult);
            this.session.append(errResult);
            continue;
          }

          this.onOutput(`  [tool: ${toolCall.function.name}]`);

          const result = await tool.execute(args);

          const toolResult: Message = {
            role: "tool",
            content: result.output,
            tool_call_id: toolCall.id,
          };

          this.messages.push(toolResult);
          this.session.append(toolResult);
        }
      }

      return `Reached maximum turns (${MAX_TURNS}). Last response may be incomplete.`;
    });
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  getProvider(): string {
    return this.provider.name;
  }
}
