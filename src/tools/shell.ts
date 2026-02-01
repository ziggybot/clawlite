import { exec } from "child_process";
import type { Tool, ToolResult } from "./types.js";
import type { ToolDef } from "../llm/types.js";

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  />\s*\/dev\/sd/,
  /dd\s+if=/,
  /:\(\)\{\s*:\|\s*:&\s*\}\s*;/,
  /\$\(.*\)/,
  /`[^`]*`/,
  /sudo\s+rm/,
  />\s*\/etc\//,
  /chmod\s+777/,
];

const SAFE_COMMANDS = [
  "ls",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "wc",
  "sort",
  "uniq",
  "cut",
  "tr",
  "date",
  "whoami",
  "uname",
  "df",
  "du",
  "git status",
  "git log",
  "git diff",
  "git branch",
  "npm list",
  "node --version",
  "python --version",
];

export interface ShellConfig {
  workingDir: string;
  timeout: number;
  requireApproval: boolean;
  onApprovalRequest?: (command: string) => Promise<boolean>;
}

export class ShellTool implements Tool {
  name = "shell";
  private config: ShellConfig;

  definition: ToolDef = {
    type: "function",
    function: {
      name: "shell",
      description:
        "Run a shell command. Use for git, npm, system commands. Output is returned as text.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["command"],
      },
    },
  };

  constructor(config: ShellConfig) {
    this.config = config;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;

    if (!command) {
      return { output: "Error: no command provided", success: false };
    }

    // Safety check
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          output: `Blocked: command matches dangerous pattern ${pattern}`,
          success: false,
        };
      }
    }

    // Check if approval needed
    const isSafe = SAFE_COMMANDS.some((safe) => command.trimStart().startsWith(safe));

    if (!isSafe && this.config.requireApproval && this.config.onApprovalRequest) {
      const approved = await this.config.onApprovalRequest(command);
      if (!approved) {
        return { output: "Command denied by user", success: false };
      }
    }

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: this.config.workingDir,
          timeout: this.config.timeout,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const output = stderr || error.message;
            // Truncate output for small context windows
            resolve({
              output: truncate(output, 2000),
              success: false,
            });
          } else {
            const output = stdout || stderr || "(no output)";
            resolve({
              output: truncate(output, 4000),
              success: true,
            });
          }
        },
      );
    });
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (truncated, ${text.length - max} chars omitted)`;
}
