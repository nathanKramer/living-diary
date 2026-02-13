import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { Person, Relationship } from "@shared/types";
import { PeopleGraph } from "./PeopleGraph";

const REL_COLORS: Record<string, string> = {
  sibling: "#F5A623",
  parent: "#A78BDB",
  child: "#A78BDB",
  partner: "#E88FB4",
  friend: "#7CB86A",
  coworker: "#FF9B71",
  pet: "#E87461",
  other: "#A89585",
};

export function PeoplePanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = searchParams.get("view") === "graph" ? "graph" : "list";

  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPeople()
      .then((graph) => {
        setPeople(graph.people);
        setRelationships(graph.relationships);
      })
      .catch((err) => console.error("Failed to load people:", err))
      .finally(() => setLoading(false));
  }, []);

  const setViewMode = (mode: "list" | "graph") => {
    if (mode === "graph") {
      setSearchParams({ view: "graph" });
    } else {
      setSearchParams({});
    }
  };

  const selectPerson = (id: string) => {
    navigate(`/people/${id}`);
  };

  if (loading) {
    return <p className="empty-state">Loading people...</p>;
  }

  if (people.length === 0) {
    return (
      <p className="empty-state">
        No people recorded yet. As you chat with the bot and mention people,
        they'll appear here.
      </p>
    );
  }

  return (
    <div className="people-panel-content">
      <div className="people-view-toggle">
        <button
          className={viewMode === "list" ? "active" : ""}
          onClick={() => setViewMode("list")}
        >
          List
        </button>
        <button
          className={viewMode === "graph" ? "active" : ""}
          onClick={() => setViewMode("graph")}
        >
          Graph
        </button>
      </div>

      {viewMode === "graph" ? (
        <PeopleGraph
          people={people}
          relationships={relationships}
          onSelectPerson={selectPerson}
        />
      ) : (
        <div className="people-list">
          {people.map((person) => {
            const personRels = relationships.filter(
              (r) => r.personId1 === person.id || r.personId2 === person.id,
            );
            return (
              <div
                key={person.id}
                className="person-card"
                onClick={() => selectPerson(person.id)}
              >
                <div className="person-card-header">
                  <span className="person-name">{person.name}</span>
                  {person.aliases.length > 0 && (
                    <span className="person-card-aliases">
                      {person.aliases.join(", ")}
                    </span>
                  )}
                </div>
                {person.bio && <p className="person-card-bio">{person.bio}</p>}
                {personRels.length > 0 && (
                  <div className="person-card-rels">
                    {personRels.map((rel) => (
                      <span
                        key={rel.id}
                        className="rel-badge-small"
                        style={{
                          backgroundColor: REL_COLORS[rel.type] ?? "#6b7280",
                        }}
                      >
                        {rel.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
