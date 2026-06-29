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
  return ["Wed", "Sat"].includes(parts.weekday) && parts.hour === "20";
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

export default async function handler() {
  if (!isBerlinUpdateSlot()) {
    return Response.json({ ok: true, skipped: true, reason: "outside Berlin 20:00 Wednesday/Saturday slot" });
  }

  const store = getStore(STORE_NAME);
  const recordsPayload = (await readJsonBlob(store, RECORDS_KEY)) ?? (await readStaticRecords());
  const latest = await fetchLatestDraw();
  const incoming = { ...latest, source: latest.source ?? "official-live-source" };
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
  });
}

export const config = {
  schedule: "0,15,30,45 18,19 * * 3,6",
};
