import { useState, useEffect } from "react";
import { api, type Stats } from "../api";

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getStats()
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p className="error">Failed to load stats: {error}</p>;
  }

  if (!stats) {
    return <p className="empty-state">Loading stats...</p>;
  }

  if (stats.count === 0) {
    return <p className="empty-state">No memories stored yet.</p>;
  }

  const sortedTypes = Object.entries(stats.byType).sort(
    ([, a], [, b]) => b - a,
  );

  return (
    <div className="stats-panel">
      <div className="stat-card">
        <div className="stat-value">{stats.count}</div>
        <div className="stat-label">Total memories</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">By type</div>
        <div className="type-breakdown">
          {sortedTypes.map(([type, count]) => (
            <div key={type} className="type-row">
              <span className="type-name">{formatType(type)}</span>
              <span className="type-count">{count}</span>
              <div
                className="type-bar"
                style={{ width: `${(count / stats.count) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Date range</div>
        <p>
          {stats.oldest ? formatDate(stats.oldest) : "—"} to{" "}
          {stats.newest ? formatDate(stats.newest) : "—"}
        </p>
      </div>
    </div>
  );
}
