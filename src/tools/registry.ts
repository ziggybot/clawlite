import type { Tool } from "./types.js";
import type { ToolDef } from "../llm/types.js";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tool definitions for the LLM.
   * Pass specific names to load only what's needed (saves context tokens).
   */
  getDefinitions(names?: string[]): ToolDef[] {
    if (names) {
      return names
        .map((n) => this.tools.get(n))
        .filter((t): t is Tool => !!t)
        .map((t) => t.definition);
    }
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
