/**
 * SKILL.md loader - borrowed from OpenClaw.
 *
 * Skills are markdown files with optional YAML frontmatter.
 * They get injected into the system prompt to shape agent behaviour.
 *
 * Format:
 * ---
 * name: code-review
 * trigger: review
 * ---
 * Instructions for the agent when this skill is active.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export interface Skill {
  name: string;
  trigger?: string;
  content: string;
  filePath: string;
}

export class SkillLoader {
  private skills: Skill[] = [];
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.dir)) return;

    const files = readdirSync(this.dir).filter(
      (f) => f.endsWith(".md") || f.endsWith(".markdown"),
    );

    for (const file of files) {
      const filePath = join(this.dir, file);
      const raw = readFileSync(filePath, "utf-8");
      const skill = this.parse(raw, filePath);
      if (skill) {
        this.skills.push(skill);
      }
    }
  }

  private parse(raw: string, filePath: string): Skill | null {
    const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (frontmatterMatch) {
      const meta = frontmatterMatch[1];
      const content = frontmatterMatch[2].trim();

      const name = this.extractField(meta, "name") || filePath;
      const trigger = this.extractField(meta, "trigger");

      return { name, trigger: trigger || undefined, content, filePath };
    }

    // No frontmatter: use filename as name, entire content as instructions
    const name = filePath.replace(/\.(md|markdown)$/, "").split("/").pop() || filePath;
    return { name, content: raw.trim(), filePath };
  }

  private extractField(yaml: string, field: string): string | null {
    const match = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : null;
  }

  /**
   * Get skills relevant to a user message.
   * Always-on skills (no trigger) are always included.
   * Triggered skills are included when the message contains the trigger word.
   */
  getRelevant(userMessage: string): Skill[] {
    const lower = userMessage.toLowerCase();
    return this.skills.filter((skill) => {
      if (!skill.trigger) return true;
      return lower.includes(skill.trigger.toLowerCase());
    });
  }

  /**
   * Build a system prompt addition from relevant skills.
   */
  buildPrompt(userMessage: string): string {
    const relevant = this.getRelevant(userMessage);
    if (relevant.length === 0) return "";

    const parts = relevant.map(
      (s) => `[Skill: ${s.name}]\n${s.content}`,
    );

    return "\n\n" + parts.join("\n\n");
  }

  listAll(): Skill[] {
    return [...this.skills];
  }

  get count(): number {
    return this.skills.length;
  }
}
