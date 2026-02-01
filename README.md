# clawlite

A lightweight CLI agent framework built for local small LLMs. Inspired by the [OpenClaw](https://github.com/openclaw/openclaw) architecture, stripped down to the core patterns that matter when you are running quantised models with limited context windows.

**[clawlite.com](https://clawlite.com)**

## What it does

You type a prompt. The agent reasons, calls tools (shell commands, file operations), and responds. It keeps going until the task is done or it hits the turn limit.

```
you > list all TypeScript files in src/
  [tool: shell]

clawlite > Found 12 TypeScript files in src/:
  src/index.ts
  src/agent.ts
  ...
```

## Why this exists

OpenClaw is excellent but it ships with a gateway server, channel adapters, web dashboard, browser automation, and a lot of infrastructure. If you are running Qwen 2.5 32B on an NVIDIA DGX Spark and just need an agent that can use tools reliably, most of that is overhead.

ClawLite takes the architectural patterns that matter and leaves the rest behind:

- **Lane-based serial queue** from OpenClaw (serial by default, parallel only when safe)
- **Context window guard** with automatic compaction before you hit the limit
- **SKILL.md loading** from OpenClaw (configure behaviour with markdown, not code)
- **Persistent command approvals** from OpenClaw (approve once, remembered next time)
- **Provider fallback** (local Ollama fails, falls back to Groq API automatically)

## Install

```bash
git clone https://github.com/ziggybot/clawlite.git
cd clawlite
npm install
```

## Configure

```bash
cp config.example.json clawlite.config.json
```

Edit `clawlite.config.json`:

```json
{
  "llm": {
    "primary": {
      "provider": "ollama",
      "model": "qwen2.5:32b"
    },
    "fallback": {
      "provider": "groq",
      "model": "llama-3.3-70b-versatile",
      "apiKey": "gsk_your_key"
    },
    "maxContextTokens": 16384,
    "compactThreshold": 0.8
  }
}
```

All config is optional. Defaults to Ollama with `qwen2.5:32b`, 16K context, 80% compaction threshold.

## Run

```bash
npx clawlite
```

Or with npm:

```bash
npm start
```

Resume a previous session:

```bash
npx clawlite --resume session_1706644800000
```

## Skills

Drop markdown files in a `skills/` directory to configure agent behaviour. This is the same pattern OpenClaw uses.

```markdown
---
name: code-review
trigger: review
---

When asked to review code:
- Check for security issues first
- Flag any hardcoded credentials
- Note missing error handling
- Be concise, use bullet points
```

Skills with a `trigger` keyword are loaded dynamically when the user's message matches. Skills without a trigger are always loaded.

## Commands

| Command | What it does |
|---------|-------------|
| `/quit` | Exit |
| `/session` | Show message count and active provider |
| `/tools` | List available tools |
| `/skills` | List loaded skills |
| `/approve` | Show persistent command approvals |

## Architecture

```
src/
  index.ts          CLI entry + REPL
  agent.ts          Agentic loop (tools until text, max 15 turns)
  config.ts         JSON config with sensible defaults
  context.ts        Context window guard + compaction
  lane.ts           Serial command queue
  llm/
    ollama.ts       Local inference via Ollama
    groq.ts         Groq API fallback
  tools/
    shell.ts        Shell with safety checks + approval
    files.ts        Read, write, edit with path restrictions
    skills.ts       SKILL.md loader
    registry.ts     Dynamic tool registry
  memory/
    session.ts      JSONL persistence
    approvals.ts    Persistent command approval store
```

## Design choices for small LLMs

- **One tool call per turn.** Small quantised models fumble parallel tool calls. Serial is more reliable.
- **Truncated outputs.** Shell output capped at 4K, file reads at 8K. Saves context for reasoning.
- **Minimal system prompt.** Every token counts at 16K context.
- **Compaction at 80%.** Summarises older conversation before hitting the wall, not after.
- **No browser tool.** Playwright is a heavy dependency. Add it if you need it.

## Differences from OpenClaw

| Feature | OpenClaw | clawlite |
|---------|----------|----------|
| Gateway server | Yes | No |
| Channel adapters | Telegram, WhatsApp, Slack, etc. | CLI only |
| Web dashboard | Yes | No |
| Browser tool | Playwright + semantic snapshots | No |
| Memory search | Vector + keyword hybrid | JSONL only |
| Skill system | SKILL.md | SKILL.md (same) |
| Context management | Guard + compaction | Guard + compaction (same) |
| Command safety | Allowlist + pattern block | Allowlist + pattern block (same) |
| Provider fallback | Yes | Yes (same) |
| Multi-session | Yes | Yes (same) |

## Extending

Add a new tool:

```typescript
import type { Tool, ToolResult } from "./tools/types.js";

export class MyTool implements Tool {
  name = "my_tool";
  definition = { /* OpenAI function calling format */ };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return { output: "done", success: true };
  }
}
```

Register it in `index.ts`:

```typescript
registry.register(new MyTool());
```

Add a new LLM provider:

```typescript
import type { LLMProvider } from "./llm/types.js";

export class MyProvider implements LLMProvider {
  name = "my_provider";
  async chat(messages, tools?) { /* ... */ }
  estimateTokens(text) { return Math.ceil(text.length / 4); }
}
```

## Licence

MIT. See [LICENSE](LICENSE).

Built by [Ziggy](https://ziggy.bot).
