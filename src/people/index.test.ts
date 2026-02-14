import { describe, it, expect, beforeEach } from "vitest";
import { PeopleGraphHolder } from "./index.js";
import type { PeopleGraph, Person } from "../shared/types.js";

function emptyGraph(): PeopleGraph {
  return { people: [], relationships: [] };
}

function makePerson(overrides: Partial<Person> & { name: string }): Person {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name,
    aliases: overrides.aliases ?? [],
    telegramUserId: overrides.telegramUserId ?? null,
    bio: overrides.bio ?? "",
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

describe("PeopleGraphHolder", () => {
  let holder: PeopleGraphHolder;

  beforeEach(() => {
    holder = new PeopleGraphHolder(emptyGraph());
  });

  // --- findPersonByName ---

  describe("findPersonByName", () => {
    it("finds person by exact name", () => {
      const person = makePerson({ name: "Nathan" });
      holder.current.people.push(person);

      expect(holder.findPersonByName("Nathan")).toBe(person);
    });

    it("finds person by case-insensitive name", () => {
      const person = makePerson({ name: "Nathan" });
      holder.current.people.push(person);

      expect(holder.findPersonByName("nathan")).toBe(person);
      expect(holder.findPersonByName("NATHAN")).toBe(person);
    });

    it("finds person by alias", () => {
      const person = makePerson({ name: "Elizabeth", aliases: ["Lizzy", "Liz"] });
      holder.current.people.push(person);

      expect(holder.findPersonByName("Lizzy")).toBe(person);
      expect(holder.findPersonByName("Liz")).toBe(person);
    });

    it("finds person by case-insensitive alias", () => {
      const person = makePerson({ name: "Elizabeth", aliases: ["Lizzy"] });
      holder.current.people.push(person);

      expect(holder.findPersonByName("lizzy")).toBe(person);
    });

    it("returns undefined when no match", () => {
      holder.current.people.push(makePerson({ name: "Nathan" }));

      expect(holder.findPersonByName("Unknown")).toBeUndefined();
    });
  });

  // --- findOrCreatePerson ---

  describe("findOrCreatePerson", () => {
    it("returns existing person when name matches", () => {
      const person = makePerson({ name: "Nathan" });
      holder.current.people.push(person);

      const result = holder.findOrCreatePerson("Nathan");
      expect(result).toBe(person);
      expect(holder.current.people).toHaveLength(1);
    });

    it("returns existing person when alias matches", () => {
      const person = makePerson({ name: "Elizabeth", aliases: ["Lizzy"] });
      holder.current.people.push(person);

      const result = holder.findOrCreatePerson("Lizzy");
      expect(result).toBe(person);
      expect(holder.current.people).toHaveLength(1);
    });

    it("creates new person when no match exists", () => {
      const result = holder.findOrCreatePerson("Nathan");

      expect(holder.current.people).toHaveLength(1);
      expect(result.name).toBe("Nathan");
      expect(result.id).toBeTruthy();
      expect(result.aliases).toEqual([]);
      expect(result.telegramUserId).toBeNull();
      expect(result.bio).toBe("");
    });

    it("does not create duplicate when called twice with same name", () => {
      const first = holder.findOrCreatePerson("Nathan");
      const second = holder.findOrCreatePerson("Nathan");

      expect(first).toBe(second);
      expect(holder.current.people).toHaveLength(1);
    });
  });

  // --- addRelationship ---

  describe("addRelationship", () => {
    it("creates relationship between two existing people", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");

      const rel = holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");

      expect(rel).not.toBeNull();
      expect(rel!.personId1).toBe(nathan.id);
      expect(rel!.personId2).toBe(lizzy.id);
      expect(rel!.type).toBe("sibling");
      expect(rel!.label).toBe("siblings");
      expect(holder.current.relationships).toHaveLength(1);
    });

    it("returns null when personId1 does not exist", () => {
      const lizzy = holder.findOrCreatePerson("Lizzy");
      const rel = holder.addRelationship("nonexistent", lizzy.id, "sibling", "siblings");

      expect(rel).toBeNull();
      expect(holder.current.relationships).toHaveLength(0);
    });

    it("returns null when personId2 does not exist", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const rel = holder.addRelationship(nathan.id, "nonexistent", "sibling", "siblings");

      expect(rel).toBeNull();
    });

    it("prevents duplicate relationship (same type, same pair)", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");

      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");
      const dupe = holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");

      expect(dupe).toBeNull();
      expect(holder.current.relationships).toHaveLength(1);
    });

    it("prevents duplicate regardless of person order (bidirectional dedup)", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");

      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");
      const reversed = holder.addRelationship(lizzy.id, nathan.id, "sibling", "siblings");

      expect(reversed).toBeNull();
      expect(holder.current.relationships).toHaveLength(1);
    });

    it("allows different relationship types between same two people", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const bob = holder.findOrCreatePerson("Bob");

      const rel1 = holder.addRelationship(nathan.id, bob.id, "friend", "friends");
      const rel2 = holder.addRelationship(nathan.id, bob.id, "coworker", "colleagues");

      expect(rel1).not.toBeNull();
      expect(rel2).not.toBeNull();
      expect(holder.current.relationships).toHaveLength(2);
    });
  });

  // --- getRelationshipsForPerson ---

  describe("getRelationshipsForPerson", () => {
    it("finds relationships where person is personId1", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");
      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");

      const rels = holder.getRelationshipsForPerson(nathan.id);
      expect(rels).toHaveLength(1);
      expect(rels[0]!.other).toBe(lizzy);
    });

    it("finds relationships where person is personId2", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");
      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");

      const rels = holder.getRelationshipsForPerson(lizzy.id);
      expect(rels).toHaveLength(1);
      expect(rels[0]!.other).toBe(nathan);
    });

    it("returns empty array when person has no relationships", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      expect(holder.getRelationshipsForPerson(nathan.id)).toEqual([]);
    });
  });

  // --- deletePerson ---

  describe("deletePerson", () => {
    it("removes the person from people array", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      expect(holder.current.people).toHaveLength(1);

      holder.deletePerson(nathan.id);
      expect(holder.current.people).toHaveLength(0);
    });

    it("cascade-deletes all relationships involving the person", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");
      const bob = holder.findOrCreatePerson("Bob");
      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");
      holder.addRelationship(nathan.id, bob.id, "friend", "friends");
      holder.addRelationship(lizzy.id, bob.id, "friend", "friends");

      expect(holder.current.relationships).toHaveLength(3);

      holder.deletePerson(nathan.id);
      expect(holder.current.relationships).toHaveLength(1);
      expect(holder.current.relationships[0]!.personId1).toBe(lizzy.id);
    });

    it("returns false for non-existent person", () => {
      expect(holder.deletePerson("nonexistent")).toBe(false);
    });

    it("does not affect other people", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");

      holder.deletePerson(nathan.id);
      expect(holder.current.people).toHaveLength(1);
      expect(holder.current.people[0]!).toBe(lizzy);
    });
  });

  // --- updatePerson ---

  describe("updatePerson", () => {
    it("updates name", () => {
      const person = holder.findOrCreatePerson("John");
      holder.updatePerson(person.id, { name: "John Doe" });

      expect(person.name).toBe("John Doe");
    });

    it("updates bio, truncating to 50 chars", () => {
      const person = holder.findOrCreatePerson("Nathan");
      const longBio = "A".repeat(100);
      holder.updatePerson(person.id, { bio: longBio });

      expect(person.bio).toHaveLength(50);
    });

    it("updates aliases", () => {
      const person = holder.findOrCreatePerson("Nathan");
      holder.updatePerson(person.id, { aliases: ["Nate", "N"] });

      expect(person.aliases).toEqual(["Nate", "N"]);
    });

    it("updates telegramUserId", () => {
      const person = holder.findOrCreatePerson("Nathan");
      holder.updatePerson(person.id, { telegramUserId: 12345 });

      expect(person.telegramUserId).toBe(12345);
    });

    it("returns null for non-existent person", () => {
      expect(holder.updatePerson("nonexistent", { name: "Nobody" })).toBeNull();
    });

    it("updates updatedAt timestamp", () => {
      const person = holder.findOrCreatePerson("Nathan");
      const before = person.updatedAt;

      // Ensure time advances
      holder.updatePerson(person.id, { bio: "updated" });
      expect(person.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  // --- mergePeople ---

  describe("mergePeople", () => {
    it("merges aliases from both people, adding merged person name as alias", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      keep.aliases = ["Nate"];
      const merge = holder.findOrCreatePerson("Nathaniel");
      merge.aliases = ["Nath"];

      holder.mergePeople(keep.id, merge.id);

      expect(keep.aliases).toContain("Nate");
      expect(keep.aliases).toContain("Nathaniel");
      expect(keep.aliases).toContain("Nath");
    });

    it("does not include keep person name in aliases", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      const merge = holder.findOrCreatePerson("Nate");

      holder.mergePeople(keep.id, merge.id);
      expect(keep.aliases).not.toContain("Nathan");
    });

    it("keeps primary bio when both have bios", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      keep.bio = "engineer";
      const merge = holder.findOrCreatePerson("Nate");
      merge.bio = "developer";

      holder.mergePeople(keep.id, merge.id);
      expect(keep.bio).toBe("engineer");
    });

    it("falls back to merge source bio when primary has none", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      keep.bio = "";
      const merge = holder.findOrCreatePerson("Nate");
      merge.bio = "developer";

      holder.mergePeople(keep.id, merge.id);
      expect(keep.bio).toBe("developer");
    });

    it("adopts telegramUserId from merge source when primary has none", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      const merge = holder.findOrCreatePerson("Nate");
      merge.telegramUserId = 12345;

      holder.mergePeople(keep.id, merge.id);
      expect(keep.telegramUserId).toBe(12345);
    });

    it("keeps primary telegramUserId when both have one", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      keep.telegramUserId = 11111;
      const merge = holder.findOrCreatePerson("Nate");
      merge.telegramUserId = 22222;

      holder.mergePeople(keep.id, merge.id);
      expect(keep.telegramUserId).toBe(11111);
    });

    it("reassigns relationships from merged person to kept person", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      const merge = holder.findOrCreatePerson("Nate");
      const lizzy = holder.findOrCreatePerson("Lizzy");
      holder.addRelationship(merge.id, lizzy.id, "friend", "friends");

      holder.mergePeople(keep.id, merge.id);

      const rels = holder.getRelationshipsForPerson(keep.id);
      expect(rels).toHaveLength(1);
      expect(rels[0]!.other).toBe(lizzy);
    });

    it("removes self-referencing relationships after reassignment", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      const merge = holder.findOrCreatePerson("Nate");
      // A relationship between keep and merge becomes self-referencing after merge
      holder.addRelationship(keep.id, merge.id, "friend", "friends");

      holder.mergePeople(keep.id, merge.id);

      // Self-referencing relationship should be removed
      expect(holder.current.relationships).toHaveLength(0);
    });

    it("removes the merged person from people array", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      const merge = holder.findOrCreatePerson("Nate");

      holder.mergePeople(keep.id, merge.id);
      expect(holder.current.people).toHaveLength(1);
      expect(holder.current.people[0]!).toBe(keep);
    });

    it("returns null when keep person does not exist", () => {
      const merge = holder.findOrCreatePerson("Nate");
      expect(holder.mergePeople("nonexistent", merge.id)).toBeNull();
    });

    it("returns null when merge person does not exist", () => {
      const keep = holder.findOrCreatePerson("Nathan");
      expect(holder.mergePeople(keep.id, "nonexistent")).toBeNull();
    });
  });

  // --- formatPeopleContext ---

  describe("formatPeopleContext", () => {
    it("returns undefined for empty graph", () => {
      expect(holder.formatPeopleContext()).toBeUndefined();
    });

    it("formats person with name only", () => {
      holder.findOrCreatePerson("Nathan");
      const ctx = holder.formatPeopleContext()!;
      expect(ctx).toContain("- Nathan");
    });

    it("includes aliases in [aka ...] format", () => {
      const person = holder.findOrCreatePerson("Elizabeth");
      person.aliases = ["Lizzy", "Liz"];

      const ctx = holder.formatPeopleContext()!;
      expect(ctx).toContain("[aka Lizzy, Liz]");
    });

    it("includes relationship labels", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");
      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");

      const ctx = holder.formatPeopleContext()!;
      expect(ctx).toContain("(siblings)");
    });

    it("includes bio after dash", () => {
      const person = holder.findOrCreatePerson("Nathan");
      person.bio = "software engineer";

      const ctx = holder.formatPeopleContext()!;
      expect(ctx).toContain("— software engineer");
    });
  });

  // --- formatPersonDetail ---

  describe("formatPersonDetail", () => {
    it("returns undefined for non-existent person", () => {
      expect(holder.formatPersonDetail("nonexistent")).toBeUndefined();
    });

    it("formats basic person with just name", () => {
      const person = holder.findOrCreatePerson("Nathan");
      const detail = holder.formatPersonDetail(person.id)!;
      expect(detail).toContain("Name: Nathan");
    });

    it("includes aliases line when present", () => {
      const person = holder.findOrCreatePerson("Nathan");
      person.aliases = ["Nate"];
      const detail = holder.formatPersonDetail(person.id)!;
      expect(detail).toContain("Also known as: Nate");
    });

    it("includes bio line when present", () => {
      const person = holder.findOrCreatePerson("Nathan");
      person.bio = "engineer";
      const detail = holder.formatPersonDetail(person.id)!;
      expect(detail).toContain("Bio: engineer");
    });

    it("includes relationships section", () => {
      const nathan = holder.findOrCreatePerson("Nathan");
      const lizzy = holder.findOrCreatePerson("Lizzy");
      holder.addRelationship(nathan.id, lizzy.id, "sibling", "siblings");

      const detail = holder.formatPersonDetail(nathan.id)!;
      expect(detail).toContain("Relationships:");
      expect(detail).toContain("siblings: Lizzy");
    });
  });
});
