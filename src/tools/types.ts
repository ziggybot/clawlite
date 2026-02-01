import type { ToolDef } from "../llm/types.js";

export interface ToolResult {
  output: string;
  success: boolean;
}

export interface Tool {
  name: string;
  definition: ToolDef;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
