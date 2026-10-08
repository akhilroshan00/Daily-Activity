// Read-only heuristic scan. Reports locations, never matched credential values.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  ],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["google-client-secret", /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["supabase-secret-key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ["stripe-live-secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["openai-secret", /\bsk-(?:proj-|svcacct-)[A-Za-z0-9_-]{30,}\b/],
];
const privateValues = Object.entries(process.env).filter(
  ([key, value]) =>
    /GOOGLE_CLIENT_SECRET|GOOGLE_TOKEN_ENCRYPTION_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_PASSWORD/.test(
      key,
    ) && value?.length >= 16,
);
const findings = [];
let blobs = 0,
  workingFiles = 0,
  clientFiles = 0;
function inspect(text, location) {
  for (const [kind, pattern] of patterns)
    if (pattern.test(text)) findings.push({ location, kind });
  for (const [key, value] of privateValues)
    if (text.includes(value))
      findings.push({ location, kind: `local-secret:${key}` });
  for (const match of text.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      if (
        JSON.parse(Buffer.from(match[1], "base64url").toString()).role ===
        "service_role"
      )
        findings.push({ location, kind: "privileged-supabase-jwt" });
    } catch {}
  }
}
function git(args, cwd) {
  return execFileSync("git", args, { cwd, maxBuffer: 128 * 1024 * 1024 });
}
for (const cwd of [process.cwd(), join(process.cwd(), "daily-activity")]) {
  if (!existsSync(join(cwd, ".git"))) continue;
  const label = cwd === process.cwd() ? "app" : "nested-starter";
  const objects = git(["rev-list", "--objects", "--all"], cwd)
    .toString()
    .trim()
    .split("\n")
    .map((line) => {
      const space = line.indexOf(" ");
      return {
        hash: line.slice(0, space),
        path: line.slice(space + 1),
        valid: space > 0,
      };
    })
    .filter(
      (item) =>
        item.valid &&
        /(?:\.(?:tsx?|m?js|json|md|txt|sql|ya?ml|toml|sh|ps1)|(?:^|\/)\.env[^/]*|\.gitignore)$/.test(
          item.path,
        ),
    );
  const unique = [
    ...new Map(objects.map((item) => [item.hash, item])).values(),
  ];
  if (unique.length) {
    const output = execFileSync("git", ["cat-file", "--batch"], {
      cwd,
      input: unique.map((item) => item.hash).join("\n") + "\n",
      maxBuffer: 128 * 1024 * 1024,
    });
    let offset = 0;
    for (const item of unique) {
      const end = output.indexOf(10, offset);
      const header = output.subarray(offset, end).toString().split(" ");
      const size = Number(header[2]);
      offset = end + 1;
      if (header[1] === "blob") {
        inspect(
          output.subarray(offset, offset + size).toString(),
          `${label}:history:${item.path}@${item.hash.slice(0, 8)}`,
        );
        blobs++;
      }
      offset += size + 1;
    }
  }
  for (const path of git(["ls-files", "-z"], cwd)
    .toString()
    .split("\0")
    .filter(Boolean)) {
    if (
      !/\.(?:tsx?|m?js|json|md|txt|sql|ya?ml|toml)$|\.env|\.gitignore/.test(
        path,
      )
    )
      continue;
    const file = join(cwd, path);
    if (existsSync(file)) {
      inspect(readFileSync(file, "utf8"), `${label}:working:${path}`);
      workingFiles++;
    }
  }
}
function scanClient(dir) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    if (item.isDirectory()) scanClient(file);
    else if (/\.(?:js|map)$/.test(item.name)) {
      inspect(
        readFileSync(file, "utf8"),
        `browser-build:${file.slice(process.cwd().length + 1)}`,
      );
      clientFiles++;
    }
  }
}
scanClient(join(process.cwd(), ".next", "static"));
const publicNames = Object.entries(process.env)
  .filter(
    ([key, value]) =>
      key.startsWith("NEXT_PUBLIC_") &&
      value &&
      /SECRET|PASSWORD|PRIVATE|SERVICE_ROLE/i.test(key),
  )
  .map(([key]) => key);
console.log(
  JSON.stringify(
    {
      historyBlobs: blobs,
      workingFiles,
      browserBuildFiles: clientFiles,
      findings,
      riskyPublicVariableNames: publicNames,
    },
    null,
    2,
  ),
);
if (findings.length || publicNames.length) process.exitCode = 1;
