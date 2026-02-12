import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import type { Person, Relationship, RelationshipType, PeopleGraph } from "../shared/types.js";

export type { Person, Relationship, RelationshipType, PeopleGraph } from "../shared/types.js";

function peoplePath(): string {
  return join(config.dataDir, "people.json");
}

function emptyGraph(): PeopleGraph {
  return { people: [], relationships: [] };
}

export async function loadPeopleGraph(): Promise<PeopleGraph> {
  try {
    const raw = await readFile(peoplePath(), "utf-8");
    const parsed = JSON.parse(raw) as PeopleGraph;
    if (!Array.isArray(parsed.people) || !Array.isArray(parsed.relationships)) {
      return emptyGraph();
    }
    return parsed;
  } catch {
    return emptyGraph();
  }
}

export async function savePeopleGraph(graph: PeopleGraph): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(peoplePath(), JSON.stringify(graph, null, 2), "utf-8");
}

export class PeopleGraphHolder {
  current: PeopleGraph;

  constructor(initial: PeopleGraph) {
    this.current = initial;
  }

  findPersonByName(name: string): Person | undefined {
    const lower = name.toLowerCase();
    return this.current.people.find(
      (p) =>
        p.name.toLowerCase() === lower ||
        p.aliases.some((a) => a.toLowerCase() === lower),
    );
  }

  findPersonByTelegramId(telegramUserId: number): Person | undefined {
    return this.current.people.find((p) => p.telegramUserId === telegramUserId);
  }

  getRelationshipsForPerson(personId: string): Array<{ relationship: Relationship; other: Person }> {
    const results: Array<{ relationship: Relationship; other: Person }> = [];
    for (const rel of this.current.relationships) {
      if (rel.personId1 === personId) {
        const other = this.current.people.find((p) => p.id === rel.personId2);
        if (other) results.push({ relationship: rel, other });
      } else if (rel.personId2 === personId) {
        const other = this.current.people.find((p) => p.id === rel.personId1);
        if (other) results.push({ relationship: rel, other });
      }
    }
    return results;
  }

  findOrCreatePerson(name: string): Person {
    const existing = this.findPersonByName(name);
    if (existing) return existing;

    const person: Person = {
      id: uuidv4(),
      name,
      aliases: [],
      telegramUserId: null,
      bio: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.current.people.push(person);
    return person;
  }

  updatePerson(id: string, updates: Partial<Pick<Person, "name" | "aliases" | "bio" | "telegramUserId">>): Person | null {
    const person = this.current.people.find((p) => p.id === id);
    if (!person) return null;

    if (updates.name !== undefined) person.name = updates.name;
    if (updates.aliases !== undefined) person.aliases = updates.aliases;
    if (updates.bio !== undefined) person.bio = updates.bio;
    if (updates.telegramUserId !== undefined) person.telegramUserId = updates.telegramUserId;
    person.updatedAt = Date.now();
    return person;
  }

  deletePerson(id: string): boolean {
    const idx = this.current.people.findIndex((p) => p.id === id);
    if (idx === -1) return false;

    this.current.people.splice(idx, 1);
    // Remove all relationships involving this person
    this.current.relationships = this.current.relationships.filter(
      (r) => r.personId1 !== id && r.personId2 !== id,
    );
    return true;
  }

  addRelationship(personId1: string, personId2: string, type: RelationshipType, label: string): Relationship | null {
    // Check both people exist
    if (!this.current.people.find((p) => p.id === personId1)) return null;
    if (!this.current.people.find((p) => p.id === personId2)) return null;

    // Skip if already exists between same two people with same type
    const exists = this.current.relationships.some(
      (r) =>
        r.type === type &&
        ((r.personId1 === personId1 && r.personId2 === personId2) ||
          (r.personId1 === personId2 && r.personId2 === personId1)),
    );
    if (exists) return null;

    const rel: Relationship = {
      id: uuidv4(),
      personId1,
      personId2,
      type,
      label,
      createdAt: Date.now(),
    };
    this.current.relationships.push(rel);
    return rel;
  }

  deleteRelationship(id: string): boolean {
    const idx = this.current.relationships.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.current.relationships.splice(idx, 1);
    return true;
  }

  mergePeople(keepId: string, mergeId: string): Person | null {
    const keep = this.current.people.find((p) => p.id === keepId);
    const merge = this.current.people.find((p) => p.id === mergeId);
    if (!keep || !merge) return null;

    // Merge aliases (add merge's name and aliases)
    const allAliases = new Set([...keep.aliases, merge.name, ...merge.aliases]);
    allAliases.delete(keep.name); // Don't include the primary name as alias
    keep.aliases = [...allAliases];

    // Merge bio
    if (merge.bio && !keep.bio) {
      keep.bio = merge.bio;
    } else if (merge.bio && keep.bio) {
      keep.bio = `${keep.bio} ${merge.bio}`;
    }

    // Adopt telegram user ID if keep doesn't have one
    if (merge.telegramUserId && !keep.telegramUserId) {
      keep.telegramUserId = merge.telegramUserId;
    }

    // Reassign relationships from merge to keep
    for (const rel of this.current.relationships) {
      if (rel.personId1 === mergeId) rel.personId1 = keepId;
      if (rel.personId2 === mergeId) rel.personId2 = keepId;
    }

    // Remove self-referencing relationships and duplicates
    this.current.relationships = this.current.relationships.filter(
      (r) => r.personId1 !== r.personId2,
    );

    // Remove the merged person
    this.current.people = this.current.people.filter((p) => p.id !== mergeId);
    keep.updatedAt = Date.now();

    return keep;
  }

  formatPeopleContext(): string | undefined {
    if (this.current.people.length === 0) return undefined;

    const lines: string[] = [];
    for (const person of this.current.people) {
      const rels = this.getRelationshipsForPerson(person.id);
      const relLabels = rels.map((r) => r.relationship.label).filter(Boolean);
      const relPart = relLabels.length > 0 ? ` (${relLabels.join(", ")})` : "";
      const bioPart = person.bio ? ` — ${person.bio}` : "";
      const aliasPart = person.aliases.length > 0 ? ` [aka ${person.aliases.join(", ")}]` : "";
      lines.push(`- ${person.name}${aliasPart}${relPart}${bioPart}`);
    }

    return lines.join("\n");
  }

  formatPersonDetail(personId: string): string | undefined {
    const person = this.current.people.find((p) => p.id === personId);
    if (!person) return undefined;

    const parts: string[] = [`Name: ${person.name}`];
    if (person.aliases.length > 0) {
      parts.push(`Also known as: ${person.aliases.join(", ")}`);
    }
    if (person.bio) {
      parts.push(`Bio: ${person.bio}`);
    }

    const rels = this.getRelationshipsForPerson(person.id);
    if (rels.length > 0) {
      parts.push("Relationships:");
      for (const { relationship, other } of rels) {
        parts.push(`  - ${relationship.label}: ${other.name}`);
      }
    }

    return parts.join("\n");
  }

  async save(): Promise<void> {
    await savePeopleGraph(this.current);
  }
}
