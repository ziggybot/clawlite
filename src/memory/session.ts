import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { Message } from "../llm/types.js";

export class SessionStore {
  private dir: string;
  private sessionId: string;
  private filePath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.sessionId = `session_${Date.now()}`;
    this.filePath = join(dir, `${this.sessionId}.jsonl`);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  append(message: Message): void {
    const line = JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
    });
    appendFileSync(this.filePath, line + "\n", "utf-8");
  }

  load(): Message[] {
    if (!existsSync(this.filePath)) return [];

    const lines = readFileSync(this.filePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());

    return lines.map((line) => {
      const parsed = JSON.parse(line);
      const { timestamp: _ts, ...message } = parsed;
      return message as Message;
    });
  }

  /**
   * Resume a previous session by ID.
   */
  resume(sessionId: string): boolean {
    const path = join(this.dir, `${sessionId}.jsonl`);
    if (!existsSync(path)) return false;
    this.sessionId = sessionId;
    this.filePath = path;
    return true;
  }

  /**
   * List available sessions.
   */
  listSessions(): string[] {
    if (!existsSync(this.dir)) return [];
    const { readdirSync } = require("fs");
    return (readdirSync(this.dir) as string[])
      .filter((f: string) => f.endsWith(".jsonl"))
      .map((f: string) => f.replace(".jsonl", ""))
      .sort()
      .reverse();
  }

  get id(): string {
    return this.sessionId;
  }

  get path(): string {
    return this.filePath;
  }
}
