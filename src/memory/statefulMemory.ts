// StatefulMemory: Keeps session state in memory for the duration of the process
export class StatefulMemory<T = any> {
  private state: Record<string, T> = {};

  set(key: string, value: T) {
    this.state[key] = value;
  }

  get(key: string): T | undefined {
    return this.state[key];
  }

  getAll(): Record<string, T> {
    return { ...this.state };
  }

  clear() {
    this.state = {};
  }
}
