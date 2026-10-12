import { aiImportPost } from "@/lib/ai-import-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export const POST = (request: Request) => aiImportPost(request);
