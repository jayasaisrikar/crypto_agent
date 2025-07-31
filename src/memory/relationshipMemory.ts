// RelationshipMemory: Tracks relationships between entities (user, tokens, queries, responses)
export interface Relationship {
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, any>;
}

export class RelationshipMemory {
  private relationships: Relationship[] = [];

  addRelationship(from: string, to: string, type: string, metadata?: Record<string, any>) {
    this.relationships.push({ from, to, type, metadata });
  }

  getRelationships(filter?: Partial<Relationship>) {
    return this.relationships.filter(rel => {
      return (!filter?.from || rel.from === filter.from) &&
             (!filter?.to || rel.to === filter.to) &&
             (!filter?.type || rel.type === filter.type);
    });
  }

  clear() {
    this.relationships = [];
  }
}
