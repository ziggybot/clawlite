/**
 * Persistent command approval store - borrowed from OpenClaw.
 *
 * When the user approves a shell command, it gets saved so they
 * don't have to approve the same pattern again next session.
 *
 * Stored as JSON at .miniclaw/approvals.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

interface ApprovalEntry {
  pattern: string;
  approvedAt: string;
  count: number;
}

export class ApprovalStore {
  private approvals: Map<string, ApprovalEntry> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw) as ApprovalEntry[];
      for (const entry of data) {
        this.approvals.set(entry.pattern, entry);
      }
    } catch {
      // Corrupted file, start fresh
    }
  }

  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = Array.from(this.approvals.values());
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Check if a command matches any approved pattern.
   * Matches if the command starts with an approved pattern.
   */
  isApproved(command: string): boolean {
    const trimmed = command.trim();
    for (const entry of this.approvals.values()) {
      if (trimmed.startsWith(entry.pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add an approval. Extracts the command prefix (first word + binary path)
   * so similar future commands are auto-approved.
   */
  approve(command: string): void {
    const pattern = this.extractPattern(command);
    const existing = this.approvals.get(pattern);

    this.approvals.set(pattern, {
      pattern,
      approvedAt: new Date().toISOString(),
      count: existing ? existing.count + 1 : 1,
    });

    this.save();
  }

  /**
   * Extract a reusable pattern from a command.
   * For "npm run build", the pattern is "npm run".
   * For "git push -u origin main", the pattern is "git push".
   * For single-word commands, uses the full command.
   */
  private extractPattern(command: string): string {
    const parts = command.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0];

    // For common tools, include the subcommand
    const toolsWithSubcommands = ["git", "npm", "npx", "docker", "kubectl", "cargo"];
    if (toolsWithSubcommands.includes(parts[0]) && parts.length >= 2) {
      return `${parts[0]} ${parts[1]}`;
    }

    return parts[0];
  }

  list(): ApprovalEntry[] {
    return Array.from(this.approvals.values()).sort(
      (a, b) => b.count - a.count,
    );
  }

  get count(): number {
    return this.approvals.size;
  }
}
