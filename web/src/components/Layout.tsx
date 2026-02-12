import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="layout">
      <header>
        <h1>Living Diary</h1>
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
