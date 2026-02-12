import type { Memory, MemoryType, PeopleGraph, Person, Relationship, RelationshipType } from "@shared/types";

const TOKEN_KEY = "dashboard_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface Persona {
  description: string;
  systemPromptAddition: string;
  updatedAt: number;
}

export interface Stats {
  count: number;
  byType: Record<string, number>;
  oldest: number | null;
  newest: number | null;
}

export const api = {
  getRecent: (limit = 50) =>
    apiFetch<{ memories: Memory[] }>(`/api/memories?limit=${limit}`),

  search: (q: string, limit = 10, type?: MemoryType) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    if (type) params.set("type", type);
    return apiFetch<{ memories: Memory[] }>(`/api/memories/search?${params}`);
  },

  getBySubject: (names: string[]) =>
    apiFetch<{ memories: Memory[] }>(
      `/api/memories/by-subject?names=${encodeURIComponent(names.join(","))}`,
    ),

  dateRange: (start: number, end: number, limit = 20) =>
    apiFetch<{ memories: Memory[] }>(
      `/api/memories/date-range?start=${start}&end=${end}&limit=${limit}`,
    ),

  getStats: () => apiFetch<Stats>("/api/memories/stats"),

  deleteMemory: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/memories/${id}`, { method: "DELETE" }),

  getPersona: () =>
    apiFetch<{ persona: Persona | null }>("/api/persona"),

  updatePersona: (description: string) =>
    apiFetch<{ persona: Persona }>("/api/persona", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }),

  savePersona: (systemPromptAddition: string, description?: string) =>
    apiFetch<{ persona: Persona }>("/api/persona", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPromptAddition, description }),
    }),

  resetPersona: () =>
    apiFetch<{ ok: boolean }>("/api/persona", { method: "DELETE" }),

  // People
  getPeople: () =>
    apiFetch<PeopleGraph>("/api/people"),

  updatePerson: (id: string, updates: { name?: string; aliases?: string[]; bio?: string }) =>
    apiFetch<{ person: Person }>(`/api/people/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }),

  deletePerson: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/people/${id}`, { method: "DELETE" }),

  mergePeople: (keepId: string, mergeId: string) =>
    apiFetch<{ person: Person }>(`/api/people/${keepId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mergeId }),
    }),

  addRelationship: (personId1: string, personId2: string, type: RelationshipType, label: string) =>
    apiFetch<{ relationship: Relationship }>("/api/people/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId1, personId2, type, label }),
    }),

  deleteRelationship: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/people/relationships/${id}`, { method: "DELETE" }),
};
