import { describe, it, expect } from "vitest";
import { parseExtraction } from "./extract.js";

describe("parseExtraction", () => {
  it("parses valid JSON with memories, people_updates, and core_updates", () => {
    const input = JSON.stringify({
      memories: [
        { content: "Nathan works at Acme", type: "user_fact", tags: ["work"], subject: "Nathan" },
        { content: "Had a stressful day", type: "diary_entry", tags: ["mood"] },
      ],
      people_updates: [
        {
          name: "Nathan",
          aliases: ["Nate"],
          bio_snippet: "software engineer",
          relationships: [
            { related_to: "Lizzy", type: "sibling", label: "siblings" },
          ],
        },
      ],
      core_updates: {
        name: "Luna",
        entries: ["you belong to the Kramer family"],
      },
    });

    const result = parseExtraction(input);
    expect(result.memories).toHaveLength(2);
    expect(result.memories[0]!.content).toBe("Nathan works at Acme");
    expect(result.memories[0]!.type).toBe("user_fact");
    expect(result.memories[0]!.tags).toEqual(["work"]);
    expect(result.memories[0]!.subject).toBe("Nathan");
    expect(result.memories[1]!.type).toBe("diary_entry");

    expect(result.people_updates).toHaveLength(1);
    expect(result.people_updates![0]!.name).toBe("Nathan");
    expect(result.people_updates![0]!.aliases).toEqual(["Nate"]);
    expect(result.people_updates![0]!.bio_snippet).toBe("software engineer");
    expect(result.people_updates![0]!.relationships).toHaveLength(1);
    expect(result.people_updates![0]!.relationships![0]!.type).toBe("sibling");

    expect(result.core_updates).toBeDefined();
    expect(result.core_updates!.name).toBe("Luna");
    expect(result.core_updates!.entries).toEqual(["you belong to the Kramer family"]);
  });

  it("strips markdown fences before parsing", () => {
    const json = JSON.stringify({
      memories: [{ content: "A fact", type: "user_fact", tags: ["test"] }],
    });
    const input = "```json\n" + json + "\n```";

    const result = parseExtraction(input);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]!.content).toBe("A fact");
  });

  it("returns empty memories for completely invalid JSON", () => {
    const result = parseExtraction("not json at all");
    expect(result.memories).toEqual([]);
    expect(result.people_updates).toBeUndefined();
    expect(result.core_updates).toBeUndefined();
  });

  it("returns empty memories when memories array is missing", () => {
    const result = parseExtraction('{"something_else": true}');
    expect(result.memories).toEqual([]);
  });

  it("returns empty memories when memories is not an array", () => {
    const result = parseExtraction('{"memories": "not an array"}');
    expect(result.memories).toEqual([]);
  });

  it("filters out memories with invalid types", () => {
    const input = JSON.stringify({
      memories: [
        { content: "Valid", type: "diary_entry", tags: ["ok"] },
        { content: "Invalid type", type: "random_type", tags: ["bad"] },
        { content: "Also valid", type: "user_fact", tags: ["ok"] },
      ],
    });

    const result = parseExtraction(input);
    expect(result.memories).toHaveLength(2);
    expect(result.memories[0]!.content).toBe("Valid");
    expect(result.memories[1]!.content).toBe("Also valid");
  });

  it("accepts photo_memory as a valid type", () => {
    const input = JSON.stringify({
      memories: [{ content: "Photo of sunset", type: "photo_memory", tags: ["photo"] }],
    });

    const result = parseExtraction(input);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]!.type).toBe("photo_memory");
  });

  it("filters out memories with empty content", () => {
    const input = JSON.stringify({
      memories: [
        { content: "", type: "user_fact", tags: [] },
        { content: "Has content", type: "user_fact", tags: [] },
      ],
    });

    const result = parseExtraction(input);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]!.content).toBe("Has content");
  });

  it("filters out memories without tags array", () => {
    const input = JSON.stringify({
      memories: [
        { content: "No tags", type: "user_fact", tags: "not-an-array" },
        { content: "Has tags", type: "user_fact", tags: ["ok"] },
      ],
    });

    const result = parseExtraction(input);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]!.content).toBe("Has tags");
  });

  it("filters out people_updates with empty names", () => {
    const input = JSON.stringify({
      memories: [],
      people_updates: [
        { name: "", bio_snippet: "nobody" },
        { name: "Nathan", bio_snippet: "engineer" },
      ],
    });

    const result = parseExtraction(input);
    expect(result.people_updates).toHaveLength(1);
    expect(result.people_updates![0]!.name).toBe("Nathan");
  });

  it("filters out relationships with invalid types", () => {
    const input = JSON.stringify({
      memories: [],
      people_updates: [
        {
          name: "Nathan",
          relationships: [
            { related_to: "Lizzy", type: "sibling", label: "siblings" },
            { related_to: "Bob", type: "enemy", label: "enemies" },
          ],
        },
      ],
    });

    const result = parseExtraction(input);
    expect(result.people_updates![0]!.relationships).toHaveLength(1);
    expect(result.people_updates![0]!.relationships![0]!.type).toBe("sibling");
  });

  it("preserves rename field when present and non-empty", () => {
    const input = JSON.stringify({
      memories: [],
      people_updates: [{ name: "John", rename: "John Doe" }],
    });

    const result = parseExtraction(input);
    expect(result.people_updates![0]!.rename).toBe("John Doe");
  });

  it("drops rename field when empty string", () => {
    const input = JSON.stringify({
      memories: [],
      people_updates: [{ name: "John", rename: "" }],
    });

    const result = parseExtraction(input);
    expect(result.people_updates![0]!.rename).toBeUndefined();
  });

  it("handles core_updates with only name", () => {
    const input = JSON.stringify({
      memories: [],
      core_updates: { name: "Luna" },
    });

    const result = parseExtraction(input);
    expect(result.core_updates).toBeDefined();
    expect(result.core_updates!.name).toBe("Luna");
    expect(result.core_updates!.entries).toBeUndefined();
  });

  it("handles core_updates with only entries", () => {
    const input = JSON.stringify({
      memories: [],
      core_updates: { entries: ["you belong to the family"] },
    });

    const result = parseExtraction(input);
    expect(result.core_updates).toBeDefined();
    expect(result.core_updates!.name).toBeUndefined();
    expect(result.core_updates!.entries).toEqual(["you belong to the family"]);
  });

  it("drops core_updates when name is empty and entries is empty", () => {
    const input = JSON.stringify({
      memories: [],
      core_updates: { name: "", entries: [] },
    });

    const result = parseExtraction(input);
    expect(result.core_updates).toBeUndefined();
  });

  it("filters non-string entries from core_updates.entries", () => {
    const input = JSON.stringify({
      memories: [],
      core_updates: { entries: ["valid", 123, null, "also valid", ""] },
    });

    const result = parseExtraction(input);
    expect(result.core_updates!.entries).toEqual(["valid", "also valid"]);
  });

  it("returns undefined for people_updates when all entries are invalid", () => {
    const input = JSON.stringify({
      memories: [],
      people_updates: [{ name: "" }, { name: "" }],
    });

    const result = parseExtraction(input);
    expect(result.people_updates).toBeUndefined();
  });

  it("handles empty memories array", () => {
    const input = '{"memories": []}';
    const result = parseExtraction(input);
    expect(result.memories).toEqual([]);
    expect(result.people_updates).toBeUndefined();
    expect(result.core_updates).toBeUndefined();
  });
});
