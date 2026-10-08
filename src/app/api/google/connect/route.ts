import {
  googleConnectDelete,
  googleConnectPost,
} from "@/lib/google-server-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = googleConnectPost;
export const DELETE = googleConnectDelete;
