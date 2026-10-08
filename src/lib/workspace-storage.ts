import {
  STORAGE_KEY,
  decodeEntries,
  encodeEntries,
  type Entries,
} from "./activity";

export function workspaceKeys(userId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId,
    )
  )
    throw new Error("A valid signed-in account is required.");
  const owner = userId.toLowerCase();
  return {
    activity: `${STORAGE_KEY}:${owner}`,
    focus: `daylight.focus.v1:${owner}`,
    goal: `daylight.weekly-goal:${owner}`,
  };
}

export function readWorkspaceEntries(
  storage: Pick<Storage, "getItem">,
  userId: string,
) {
  return decodeEntries(storage.getItem(workspaceKeys(userId).activity));
}
export function writeWorkspaceEntries(
  storage: Pick<Storage, "setItem">,
  userId: string,
  entries: Entries,
) {
  storage.setItem(workspaceKeys(userId).activity, encodeEntries(entries));
}
