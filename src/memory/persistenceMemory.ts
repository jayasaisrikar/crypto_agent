// PersistenceMemory: Saves and loads memory to/from disk (JSON file)
import { writeFileSync, readFileSync, existsSync } from 'fs';

export class PersistenceMemory<T = any> {
  private filePath: string;
  private state: Record<string, T> = {};

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  set(key: string, value: T) {
    this.state[key] = value;
    this.save();
  }

  get(key: string): T | undefined {
    return this.state[key];
  }

  getAll(): Record<string, T> {
    return { ...this.state };
  }

  clear() {
    this.state = {};
    this.save();
  }

  private save() {
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  private load() {
    if (existsSync(this.filePath)) {
      try {
        this.state = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      } catch {
        this.state = {};
      }
    }
  }
}
