export type MemoryType =
  | "diary_entry"
  | "user_fact"
  | "conversation_summary"
  | "reflection"
  | "photo_memory";

export interface Memory {
  id: string;
  userId: number;
  content: string;
  type: MemoryType;
  tags: string;
  timestamp: number;
  photoFileId?: string;
  source?: string;
  subjectName?: string;
}

export interface MemoryWithDistance extends Memory {
  _distance: number;
}

// People graph types

export type RelationshipType =
  | "sibling"
  | "parent"
  | "child"
  | "partner"
  | "friend"
  | "coworker"
  | "pet"
  | "other";

export interface Person {
  id: string;
  name: string;
  aliases: string[];
  telegramUserId: number | null;
  bio: string;
  createdAt: number;
  updatedAt: number;
}

export interface Relationship {
  id: string;
  personId1: string;
  personId2: string;
  type: RelationshipType;
  label: string;
  createdAt: number;
}

export interface PeopleGraph {
  people: Person[];
  relationships: Relationship[];
}
