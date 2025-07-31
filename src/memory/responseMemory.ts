// ResponseMemory: Stores LLM responses for each prompt
export interface ResponseRecord {
  timestamp: number;
  userQuery: string;
  prompt: string;
  response: string;
}

export class ResponseMemory {
  private responses: ResponseRecord[] = [];

  addResponse(userQuery: string, prompt: string, response: string) {
    this.responses.push({ timestamp: Date.now(), userQuery, prompt, response });
  }

  getResponses() {
    return [...this.responses];
  }

  clear() {
    this.responses = [];
  }
}
