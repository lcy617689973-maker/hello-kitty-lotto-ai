import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const STORE_NAME = "hello-kitty-lotto";
const STATS_KEY = "lotto-stats.json";

async function readBlobStats() {
  try {
    const store = getStore(STORE_NAME);
    const text = await store.get(STATS_KEY, { type: "text" });
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function readStaticStats() {
  const text = await readFile(join(process.cwd(), "assets", "lotto-stats.json"), "utf8");
  return JSON.parse(text);
}

export default async function handler() {
  try {
    const stats = (await readBlobStats()) ?? (await readStaticStats());
    return Response.json(stats, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return Response.json(
      { error: "lotto data unavailable", message: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
