import { useState, useEffect, type ReactNode } from "react";
import { api, UnauthorizedError, setToken } from "../api";

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const [status, setStatus] = useState<"loading" | "ok" | "need_token">("loading");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getStats()
      .then(() => setStatus("ok"))
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          setStatus("need_token");
        } else {
          // API might not be running yet, but no auth issue
          setStatus("ok");
        }
      });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setToken(input);
    api.getStats()
      .then(() => setStatus("ok"))
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          setError("Invalid token. Try again.");
        } else {
          setStatus("ok");
        }
      });
  };

  if (status === "loading") {
    return <div className="auth-gate"><p>Loading...</p></div>;
  }

  if (status === "need_token") {
    return (
      <div className="auth-gate">
        <form onSubmit={handleSubmit}>
          <h2>Dashboard Access</h2>
          <p>Enter the dashboard token to continue.</p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Dashboard token"
            autoFocus
          />
          <button type="submit">Enter</button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
