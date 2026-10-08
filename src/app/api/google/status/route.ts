import { googleStatusGet, googleStatusPatch } from "@/lib/google-server-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = googleStatusGet;
export const PATCH = googleStatusPatch;
