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
