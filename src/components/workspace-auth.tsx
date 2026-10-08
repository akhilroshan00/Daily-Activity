"use client";
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export const WorkspaceAuth = createContext<{
  user: User;
  signOut: () => Promise<void>;
} | null>(null);
export function useWorkspace() {
  const workspace = useContext(WorkspaceAuth);
  if (!workspace) throw new Error("Sign in to open your workspace.");
  return workspace;
}
