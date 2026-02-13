import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import "../chat-logs.css";

interface ChatUser {
  userId: number;
  name: string | null;
}

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function ChatLogsPanel() {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatLogUsers()
      .then(({ users }) => setUsers(users))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (selectedUser === null) return;
    setLoading(true);
    setError("");
    api.getChatLogs(selectedUser)
      .then(({ messages }) => setMessages(messages))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedUser]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (error && users.length === 0) {
    return <p className="error">{error}</p>;
  }

  if (users.length === 0 && !error) {
    return <p className="empty-state">No chat logs yet. Start a conversation with the bot!</p>;
  }

  // Group messages by date for dividers
  function renderMessages(msgs: ChatMessage[]) {
    const elements: React.ReactNode[] = [];
    let lastDate = "";

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]!;
      const date = formatDate(msg.timestamp);

      if (date !== lastDate) {
        lastDate = date;
        elements.push(
          <div key={`date-${i}`} className="chat-date-divider">
            {date}
          </div>,
        );
      }

      if (msg.role === "tool") {
        elements.push(
          <div key={i} className="chat-tool-call">
            <span className="chat-tool-name">{msg.toolName ?? "tool"}</span>
            <span className="chat-tool-detail">{msg.content}</span>
          </div>,
        );
      } else {
        elements.push(
          <div key={i} className={`chat-bubble-row ${msg.role}`}>
            <div>
              <div className="chat-bubble">{msg.content}</div>
              <div className="chat-bubble-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>,
        );
      }
    }

    return elements;
  }

  return (
    <div className="chat-logs-panel">
      <div className="chat-user-list">
        {users.map((u) => (
          <button
            key={u.userId}
            className={`chat-user-item${selectedUser === u.userId ? " active" : ""}`}
            onClick={() => setSelectedUser(u.userId)}
          >
            {u.name ?? `User ${u.userId}`}
          </button>
        ))}
      </div>

      {selectedUser !== null && (
        loading ? (
          <p className="empty-state">Loading...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : messages.length === 0 ? (
          <p className="empty-state">No messages found.</p>
        ) : (
          <div className="chat-messages">
            {renderMessages(messages)}
            <div ref={messagesEndRef} />
          </div>
        )
      )}
    </div>
  );
}
