"use client";
import { useEffect, useRef, useState } from "react";
import { type Entries } from "@/lib/activity";
import { cloudClient } from "@/lib/cloud";
import { chatContext } from "@/lib/chat-context";
export default function AppAssistant({
  entries,
  userId,
}: {
  entries: Entries;
  userId: string;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    { question: string; answer: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  async function ask() {
    if (busy || !question.trim()) return;
    const current = question.trim();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const client = cloudClient();
      const session = await client?.auth.getSession();
      if (request.signal.aborted) return;
      if (session?.data.session?.user.id !== userId)
        throw new Error("Sign in again to use the assistant.");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({
          question: current,
          context: JSON.stringify(chatContext(entries, current)),
        }),
        signal: request.signal,
      });
      const data = await response.json();
      if (request.signal.aborted) return;
      const latest = await client?.auth.getSession();
      if (request.signal.aborted || latest?.data.session?.user.id !== userId)
        return;
      if (!response.ok)
        throw new Error(data.error || "Could not answer. Try again.");
      if (data.owner !== userId || typeof data.answer !== "string")
        throw new Error("Could not verify this answer.");
      setMessages((old) => [
        ...old.slice(-9),
        { question: current, answer: data.answer },
      ]);
      setQuestion("");
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not answer.");
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  return (
    <div className="feature-card assistant-card">
      <h3>Ask Daylight</h3>
      <p>
        Search your logs or ask how to use the app. Your question and relevant
        log details are sent to Gemini when you ask. The assistant gives
        guidance; it does not edit your logs.
      </p>
      <div className="assistant-conversation" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i}>
            <strong>{m.question}</strong>
            <p>{m.answer}</p>
          </div>
        ))}
      </div>
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="daylight-question">
          Your question
          <textarea
            id="daylight-question"
            required
            maxLength={1500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Find my Excel learning sessions, or explain how to import a workbook."
          />
        </label>
        <div>
          <button className="primary-button" disabled={busy}>
            {busy ? "Thinking…" : "Ask"}
          </button>
          {busy && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                controller.current?.abort();
                controller.current = null;
                setBusy(false);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <p role="status">{error}</p>
      <small>
        Each question is answered independently. Include a date or topic for a
        focused search.
      </small>
    </div>
  );
}
