import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStats, normalizeRecords } from "./lib/stats.mjs";
import { fetchLatestDraw } from "./lib/latest-draw.mjs";

const STORE_NAME = "hello-kitty-lotto";
const RECORDS_KEY = "lotto-records.json";
const STATS_KEY = "lotto-stats.json";

async function readJsonBlob(store, key) {
  const text = await store.get(key, { type: "text" });
  return text ? JSON.parse(text) : null;
}

async function readStaticRecords() {
  const text = await readFile(join(process.cwd(), "assets", "lotto-records.json"), "utf8");
  return JSON.parse(text);
}

function payloadLatestDate(payload) {
  const records = normalizeRecords(payload?.records ?? []);
  return records.at(-1)?.date ?? "";
}

async function readBestRecordsPayload(store) {
  const [blobPayload, staticPayload] = await Promise.all([
    readJsonBlob(store, RECORDS_KEY).catch(() => null),
    readStaticRecords(),
  ]);
  if (!blobPayload) return staticPayload;
  if (!staticPayload) return blobPayload;
  return payloadLatestDate(blobPayload) >= payloadLatestDate(staticPayload) ? blobPayload : staticPayload;
}

function berlinTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isBerlinUpdateSlot(date = new Date()) {
  if (process.env.FORCE_LOTTO_UPDATE === "true") return true;
  const parts = berlinTimeParts(date);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (parts.weekday === "Wed") return hour > 18 || (hour === 18 && minute >= 25);
  if (parts.weekday === "Sat") return hour > 19 || (hour === 19 && minute >= 25);
  return false;
}

function parseManualDraw(url) {
  const date = url.searchParams.get("date")?.trim();
  const mainText = url.searchParams.get("main")?.trim();
  const superText = url.searchParams.get("super")?.trim();
  if (!date && !mainText && !superText) return null;

  const main = (mainText ?? "")
    .split(/[,\s;-]+/)
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  const superNumber = Number(superText);
  const uniqueMain = [...new Set(main)];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    throw new Error("Manual update needs date=YYYY-MM-DD");
  }
  if (uniqueMain.length !== 6 || uniqueMain.some((number) => !Number.isInteger(number) || number < 1 || number > 49)) {
    throw new Error("Manual update needs six unique main numbers in 1-49, for example main=1,2,3,4,5,6");
  }
  if (!Number.isInteger(superNumber) || superNumber < 0 || superNumber > 9) {
    throw new Error("Manual update needs super=0..9");
  }

  return {
    date,
    main: uniqueMain,
    super: superNumber,
    source: "manual-url-override",
  };
}

function mergeDraw(records, draw) {
  const normalized = normalizeRecords(records);
  const existingIndex = normalized.findIndex((row) => row.date === draw.date);
  if (existingIndex >= 0) {
    const existing = normalized[existingIndex];
    const sameMain = existing.main.join(",") === draw.main.join(",");
    const sameSuper = existing.super === draw.super;
    if (sameMain && sameSuper) return { records: normalized, changed: false, action: "already-current" };
    normalized[existingIndex] = draw;
    return { records: normalizeRecords(normalized), changed: true, action: "replaced-same-date" };
  }
  if (draw.date < normalized.at(-1).date) {
    return { records: normalized, changed: false, action: "older-than-current" };
  }
  return { records: normalizeRecords([...normalized, draw]), changed: true, action: "appended" };
}

export default async function handler(request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

  if (!force && !isBerlinUpdateSlot()) {
    return Response.json({ ok: true, skipped: true, reason: "outside Berlin draw update window: Wednesday after 18:25 or Saturday after 19:25" });
  }

  let incoming;
  try {
    incoming = parseManualDraw(url) ?? (await fetchLatestDraw());
  } catch (error) {
    const store = getStore(STORE_NAME);
    const recordsPayload = await readBestRecordsPayload(store);
    const records = normalizeRecords(recordsPayload.records);
    return Response.json(
      {
        ok: false,
        changed: false,
        action: "source-unavailable",
        message: error.message,
        latestDate: records.at(-1)?.date ?? null,
        drawCount: records.length,
        help: "If the official source is temporarily unavailable, retry later or call this function with force=1&date=YYYY-MM-DD&main=1,2,3,4,5,6&super=7",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const store = getStore(STORE_NAME);
  const recordsPayload = await readBestRecordsPayload(store);
  incoming = { ...incoming, source: incoming.source ?? "official-live-source" };
  const { records, changed, action } = mergeDraw(recordsPayload.records, incoming);
  const stats = buildStats(records);
  const nextRecordsPayload = {
    game: "LOTTO 6aus49",
    updatedAt: new Date().toISOString(),
    records,
  };

  await store.set(RECORDS_KEY, JSON.stringify(nextRecordsPayload), {
    metadata: { drawCount: records.length, latestDate: records.at(-1).date },
  });
  await store.set(STATS_KEY, JSON.stringify(stats), {
    metadata: { drawCount: stats.drawCount, latestDate: stats.dateRange.to },
  });

  return Response.json({
    ok: true,
    changed,
    action,
    latestDate: stats.dateRange.to,
    drawCount: stats.drawCount,
    source: incoming.source,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const config = {
  schedule: "*/5 16,17,18,19,20,21,22 * * 3,6",
};
