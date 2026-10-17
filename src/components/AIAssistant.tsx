"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function AIAssistant({
  className = "",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the Perfumes+ AI assistant. I know the system end-to-end (deals, offers, orders, inventory, cash flow, receipts/claims, pricing, FX, KPIs, audit, etc.). Ask me to prepare offers, run comparisons, create deals, place orders, or just answer questions.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      if (data.reply) {
        setMessages([...next, { role: "assistant", content: data.reply }]);
      } else {
        throw new Error("Empty response");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessages([...next, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          AI Assistant
        </button>
      ) : (
        <div className="flex h-[480px] w-[360px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <div className="text-sm font-medium">Perfumes+ AI</div>
            <button
              onClick={() => setOpen(false)}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Close
            </button>
          </div>
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-3 text-sm"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap rounded-md px-3 py-2 ${
                  m.role === "user"
                    ? "ml-auto bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading ? (
              <div className="text-xs text-zinc-500">Thinking…</div>
            ) : null}
          </div>
          <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              placeholder="Type a command or question…"
              className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={sendMessage}
                disabled={loading}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
