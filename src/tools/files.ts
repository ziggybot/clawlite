import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve, relative } from "path";
import type { Tool, ToolResult } from "./types.js";
import type { ToolDef } from "../llm/types.js";

export interface FilesConfig {
  allowedPaths: string[];
}

function isPathAllowed(filePath: string, allowed: string[]): boolean {
  const resolved = resolve(filePath);
  return allowed.some((base) => {
    const resolvedBase = resolve(base);
    return resolved.startsWith(resolvedBase) || relative(resolvedBase, resolved).startsWith("") && !relative(resolvedBase, resolved).startsWith("..");
  });
}

export class ReadFileTool implements Tool {
  name = "read_file";
  private config: FilesConfig;

  definition: ToolDef = {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Returns the text content.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read",
          },
        },
        required: ["path"],
      },
    },
  };

  constructor(config: FilesConfig) {
    this.config = config;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const path = args.path as string;

    if (!path) {
      return { output: "Error: no path provided", success: false };
    }

    if (!isPathAllowed(path, this.config.allowedPaths)) {
      return { output: `Error: path ${path} is outside allowed directories`, success: false };
    }

    if (!existsSync(path)) {
      return { output: `Error: file not found: ${path}`, success: false };
    }

    try {
      const content = readFileSync(path, "utf-8");
      // Truncate large files to save context
      if (content.length > 8000) {
        return {
          output: content.slice(0, 8000) + `\n... (truncated, ${content.length} total chars)`,
          success: true,
        };
      }
      return { output: content, success: true };
    } catch (e) {
      return { output: `Error reading file: ${e}`, success: false };
    }
  }
}

export class WriteFileTool implements Tool {
  name = "write_file";
  private config: FilesConfig;

  definition: ToolDef = {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates parent directories if needed.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to write the file to",
          },
          content: {
            type: "string",
            description: "The content to write",
          },
        },
        required: ["path", "content"],
      },
    },
  };

  constructor(config: FilesConfig) {
    this.config = config;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const path = args.path as string;
    const content = args.content as string;

    if (!path || content === undefined) {
      return { output: "Error: path and content are required", success: false };
    }

    if (!isPathAllowed(path, this.config.allowedPaths)) {
      return { output: `Error: path ${path} is outside allowed directories`, success: false };
    }

    try {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, content, "utf-8");
      return { output: `Written ${content.length} chars to ${path}`, success: true };
    } catch (e) {
      return { output: `Error writing file: ${e}`, success: false };
    }
  }
}

export class EditFileTool implements Tool {
  name = "edit_file";
  private config: FilesConfig;

  definition: ToolDef = {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace a specific string in a file. The old_string must match exactly.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to edit",
          },
          old_string: {
            type: "string",
            description: "The exact text to find and replace",
          },
          new_string: {
            type: "string",
            description: "The replacement text",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  };

  constructor(config: FilesConfig) {
    this.config = config;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const path = args.path as string;
    const oldStr = args.old_string as string;
    const newStr = args.new_string as string;

    if (!path || !oldStr || newStr === undefined) {
      return { output: "Error: path, old_string, and new_string are required", success: false };
    }

    if (!isPathAllowed(path, this.config.allowedPaths)) {
      return { output: `Error: path ${path} is outside allowed directories`, success: false };
    }

    if (!existsSync(path)) {
      return { output: `Error: file not found: ${path}`, success: false };
    }

    try {
      const content = readFileSync(path, "utf-8");
      if (!content.includes(oldStr)) {
        return { output: "Error: old_string not found in file", success: false };
      }

      const occurrences = content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return {
          output: `Error: old_string found ${occurrences} times, must be unique. Add more context.`,
          success: false,
        };
      }

      const updated = content.replace(oldStr, newStr);
      writeFileSync(path, updated, "utf-8");
      return { output: `Edited ${path} successfully`, success: true };
    } catch (e) {
      return { output: `Error editing file: ${e}`, success: false };
    }
  }
}
