# Browser extension hydration warning

The reported diff contains `bis_skin_checked`, `bis_register`, and a script from
`chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js`. These are
injected by the browser extension with ID `eppiocemhmnlbhjplcgkofciiegomcon`; they
are not emitted by Daylight. The extension changes the HTML before React hydrates
it, causing the server/client attribute warning.

## Fix extension access

1. Open `chrome://extensions` and enable **Developer mode** to display extension IDs.
2. Find `eppiocemhmnlbhjplcgkofciiegomcon`, then open **Details**.
3. Under **Site access**, remove access to Daylight's domain/localhost, or change
   access to **On click**. If that option is unavailable, disable the extension.
4. Close and reopen the Daylight tab, then reload the page.

## Verify

Open Daylight in an Incognito window with extensions disabled there. Check the
browser console after a full reload. The `bis_*` attributes and extension script
should be absent, and the reported hydration warning should disappear. If a
warning remains, capture its new diff so an application-owned mismatch can be
investigated separately.

Daylight's theme/colour scripts intentionally set only the root HTML appearance
attributes before paint. The existing root-only hydration suppression covers
that change; adding suppression to every element would conceal other bugs.

Reference: [Next.js hydration troubleshooting](https://nextjs.org/docs/messages/react-hydration-error).

## Login returning to the form

This warning alone does not explain a rejected password. The login review found
Supabase `invalid_credentials` responses and reused/expired confirmation links.
Signing up again with the same email does not replace an existing password.

Enter your registered email, choose **Forgot password?**, and open the newest
reset email once. The app verifies the reset session before showing the new
password form. Save matching passwords of at least eight characters. If email
delivery is limited, an existing valid reset link may still work; otherwise wait
for delivery to become available. Do not repeatedly open an old confirmation
link. The app now displays email-link redirect errors on the login form.

Password reset redirects use the current app origin. Include that origin in
Supabase's allowed redirect URLs before using a different domain or port.
