import { googleSyncPost } from "@/lib/google-server-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const POST = googleSyncPost;
