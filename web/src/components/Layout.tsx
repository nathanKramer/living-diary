import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="layout">
      <div className="decorative-blob" />
      <header>
        <h1 style={{ fontFamily: "'Caveat', cursive", fontSize: "2rem", fontWeight: 600 }}>Living Diary</h1>
        <nav>
          <NavLink to="/" end>All</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/people">People</NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
