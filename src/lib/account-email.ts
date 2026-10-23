import type { User } from "@supabase/supabase-js";

type UserResult = { data: { user: User | null }; error: unknown };
type EmailAuth = {
  getUser: () => Promise<UserResult>;
  updateUser: (
    attributes: { email: string },
    options: { emailRedirectTo: string },
  ) => Promise<UserResult>;
};

// Update the existing Auth user. Workspace ownership and storage keys use
// this user's immutable ID, so an email change needs no data migration.
export async function changeAccountEmail(
  auth: EmailAuth,
  ownerId: string,
  value: string,
  redirectTo: string,
  isActive: () => boolean,
) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid new email address.");
  const identity = await auth.getUser();
  if (identity.error) throw identity.error;
  if (!isActive() || identity.data.user?.id !== ownerId)
    throw new Error("Your account changed. Open Account & sync and try again.");
  if (identity.data.user.email?.toLowerCase() === email)
    throw new Error(
      "Enter an email address different from your current email.",
    );

  const result = await auth.updateUser(
    { email },
    { emailRedirectTo: redirectTo },
  );
  if (result.error) throw result.error;
  if (result.data.user?.id !== ownerId)
    throw new Error(
      "Could not verify the email change. Sign in again to check your account.",
    );
  return {
    email,
    pending: result.data.user.email?.toLowerCase() !== email,
  };
}
