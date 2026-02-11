import type { ReactNode } from "react";

export type Tab = "recent" | "search" | "stats";

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: ReactNode;
}

export function Layout({ activeTab, onTabChange, children }: Props) {
  return (
    <div className="layout">
      <header>
        <h1>Living Diary</h1>
        <nav>
          <button
            className={activeTab === "recent" ? "active" : ""}
            onClick={() => onTabChange("recent")}
          >
            Recent
          </button>
          <button
            className={activeTab === "search" ? "active" : ""}
            onClick={() => onTabChange("search")}
          >
            Search
          </button>
          <button
            className={activeTab === "stats" ? "active" : ""}
            onClick={() => onTabChange("stats")}
          >
            Stats
          </button>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
