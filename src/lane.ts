/**
 * Lane-based serial command queue.
 * Default: serial execution. Tasks in the same lane run one at a time.
 * Parallel lanes can be created explicitly for safe concurrent work.
 */

type Task<T> = () => Promise<T>;

interface QueuedTask {
  task: Task<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class Lane {
  private queue: QueuedTask[] = [];
  private running = false;

  async enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task: task as Task<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await item.task();
        item.resolve(result);
      } catch (e) {
        item.reject(e);
      }
    }

    this.running = false;
  }

  get pending(): number {
    return this.queue.length;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

export class LaneManager {
  private lanes: Map<string, Lane> = new Map();

  getLane(name: string): Lane {
    if (!this.lanes.has(name)) {
      this.lanes.set(name, new Lane());
    }
    return this.lanes.get(name)!;
  }

  /**
   * Run a task on the default serial lane.
   */
  async run<T>(task: Task<T>): Promise<T> {
    return this.getLane("default").enqueue(task);
  }

  /**
   * Run a task on a named parallel lane (for safe concurrent work).
   */
  async runParallel<T>(laneName: string, task: Task<T>): Promise<T> {
    return this.getLane(laneName).enqueue(task);
  }
}
