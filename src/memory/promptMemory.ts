// PromptMemory: Stores prompts sent to LLMs for auditing/debugging
export interface PromptRecord {
  timestamp: number;
  userQuery: string;
  prompt: string;
}

export class PromptMemory {
  private prompts: PromptRecord[] = [];

  addPrompt(userQuery: string, prompt: string) {
    this.prompts.push({ timestamp: Date.now(), userQuery, prompt });
  }

  getPrompts() {
    return [...this.prompts];
  }

  clear() {
    this.prompts = [];
  }
}
