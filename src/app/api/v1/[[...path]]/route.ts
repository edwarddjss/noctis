import { createDirectoryHandler } from "@/lib/directory/app";
import { DirectoryStore } from "@/lib/directory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createDirectoryHandler(
  new DirectoryStore({ upstream: process.env.DIRECTORY_URL }),
  { corsOrigin: process.env.CORS_ORIGIN },
);

export const GET = handler;
export const OPTIONS = handler;
