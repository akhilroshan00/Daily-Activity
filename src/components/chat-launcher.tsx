"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
    if (open && element && !element.open) {
      element.showModal();
    }
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
      <AnimatePresence
        onExitComplete={() => {
          if (dialog.current?.open) dialog.current.close();
        }}
      >
        {open && (
          <motion.dialog
            ref={dialog}
            className="chat-dialog"
            aria-label="Ask Daylight chatbot"
            onCancel={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              className="chat-dialog-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <X size={20} />
            </button>
            <AppAssistant userId={userId} entries={entries} />
          </motion.dialog>
        )}
      </AnimatePresence>
    </>
  );
}
