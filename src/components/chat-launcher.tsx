"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import AppAssistant from "./app-assistant";
import type { Entries } from "@/lib/activity";
export default function ChatLauncher({
  entries,
  userId,
}: {
  entries: Entries;
  userId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (open) element?.showModal();
    else element?.close();
    return () => element?.close();
  }, [open]);
  return (
    <>
      <button
        className="chat-launcher"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <MessageCircle size={20} /> Chat
      </button>
      <dialog
        ref={dialog}
        className="chat-dialog"
        aria-label="Ask Daylight chatbot"
        onCancel={() => setOpen(false)}
      >
        <button
          className="chat-dialog-close"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
        >
          <X size={20} />
        </button>
        {open && <AppAssistant userId={userId} entries={entries} />}
      </dialog>
    </>
  );
}
