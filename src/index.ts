#!/usr/bin/env node

import * as readline from "readline";
import { join } from "path";
import { loadConfig } from "./config.js";
import { OllamaProvider } from "./llm/ollama.js";
import { GroqProvider } from "./llm/groq.js";
import { ShellTool } from "./tools/shell.js";
import { ReadFileTool, WriteFileTool, EditFileTool } from "./tools/files.js";
import { ToolRegistry } from "./tools/registry.js";
import { SkillLoader } from "./tools/skills.js";
import { ContextGuard } from "./context.js";
import { SessionStore } from "./memory/session.js";
import { ApprovalStore } from "./memory/approvals.js";
import { LaneManager } from "./lane.js";
import { Agent } from "./agent.js";
import type { LLMProvider } from "./llm/types.js";
import type { LLMProviderConfig } from "./config.js";

function createProvider(config: LLMProviderConfig): LLMProvider {
  if (config.provider === "groq") {
    return new GroqProvider(config);
  }
  return new OllamaProvider(config);
}

function parseArgs(args: string[]): { resume?: string } {
  const result: { resume?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--resume" && args[i + 1]) {
      result.resume = args[i + 1];
      i++;
    }
  }
  return result;
}

async function main() {
  const config = loadConfig();
  const flags = parseArgs(process.argv.slice(2));

  console.log("clawlite v0.1.0");
  console.log(`Primary: ${config.llm.primary.provider}/${config.llm.primary.model}`);
  if (config.llm.fallback) {
    console.log(`Fallback: ${config.llm.fallback.provider}/${config.llm.fallback.model}`);
  }
  console.log(`Context: ${config.llm.maxContextTokens} tokens (compact at ${Math.round(config.llm.compactThreshold * 100)}%)`);

  // Set up readline for user approval
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askUser = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  // Build providers
  const primary = createProvider(config.llm.primary);
  const fallback = config.llm.fallback ? createProvider(config.llm.fallback) : undefined;

  // Load persistent approvals
  const approvals = new ApprovalStore(join(config.session.dir, "../approvals.json"));

  // Build tools
  const registry = new ToolRegistry();

  if (config.tools.shell.enabled) {
    registry.register(
      new ShellTool({
        workingDir: config.tools.shell.workingDir,
        timeout: config.tools.shell.timeout,
        requireApproval: config.safety.requireApproval,
        onApprovalRequest: async (command: string) => {
          // Check persistent approvals first
          if (approvals.isApproved(command)) {
            return true;
          }
          const answer = await askUser(`  Approve command? ${command} [y/N/always] `);
          const lower = answer.toLowerCase().trim();
          if (lower === "always" || lower === "a") {
            approvals.approve(command);
            return true;
          }
          return lower.startsWith("y");
        },
      }),
    );
  }

  if (config.tools.files.enabled) {
    const filesConfig = { allowedPaths: config.tools.files.allowedPaths };
    registry.register(new ReadFileTool(filesConfig));
    registry.register(new WriteFileTool(filesConfig));
    registry.register(new EditFileTool(filesConfig));
  }

  // Load skills
  const skills = new SkillLoader("skills");

  console.log(`Tools: ${registry.listNames().join(", ")}`);
  if (skills.count > 0) {
    console.log(`Skills: ${skills.listAll().map((s) => s.name).join(", ")}`);
  }
  if (approvals.count > 0) {
    console.log(`Approvals: ${approvals.count} saved`);
  }

  // Set up session (with optional resume)
  const session = new SessionStore(config.session.dir);
  if (flags.resume) {
    const resumed = session.resume(flags.resume);
    if (resumed) {
      console.log(`Resumed session: ${flags.resume}`);
    } else {
      console.log(`Session ${flags.resume} not found, starting new`);
    }
  }

  console.log(`Session: ${session.id}`);
  console.log("Type /quit to exit, /help for commands\n");

  // Build agent
  const agent = new Agent({
    provider: primary,
    fallback,
    tools: registry,
    context: new ContextGuard(config.llm.maxContextTokens, config.llm.compactThreshold),
    session,
    lanes: new LaneManager(),
    skills,
    onOutput: (text) => console.log(text),
  });

  // REPL
  const prompt = () => askUser("you > ");

  while (true) {
    const input = await prompt();
    const trimmed = input.trim();

    if (!trimmed) continue;

    if (trimmed === "/quit" || trimmed === "/exit") {
      console.log("Bye.");
      rl.close();
      process.exit(0);
    }

    if (trimmed === "/help") {
      console.log("  /quit       Exit");
      console.log("  /session    Show session info");
      console.log("  /tools      List available tools");
      console.log("  /skills     List loaded skills");
      console.log("  /approve    Show saved command approvals");
      continue;
    }

    if (trimmed === "/session") {
      console.log(`  Session: ${session.id}`);
      console.log(`  Messages: ${agent.getMessageCount()}`);
      console.log(`  Provider: ${agent.getProvider()}`);
      console.log(`  Path: ${session.path}`);
      continue;
    }

    if (trimmed === "/tools") {
      console.log(`  Available: ${registry.listNames().join(", ")}`);
      continue;
    }

    if (trimmed === "/skills") {
      const all = skills.listAll();
      if (all.length === 0) {
        console.log("  No skills loaded. Add .md files to skills/ directory.");
      } else {
        for (const s of all) {
          console.log(`  ${s.name}${s.trigger ? ` (trigger: ${s.trigger})` : " (always on)"}`);
        }
      }
      continue;
    }

    if (trimmed === "/approve") {
      const list = approvals.list();
      if (list.length === 0) {
        console.log("  No saved approvals.");
      } else {
        for (const a of list) {
          console.log(`  ${a.pattern} (used ${a.count}x)`);
        }
      }
      continue;
    }

    try {
      const response = await agent.handleMessage(trimmed);
      console.log(`\nclawlite > ${response}\n`);
    } catch (e) {
      console.error(`Error: ${e}`);
    }
  }
}

main().catch(console.error);
