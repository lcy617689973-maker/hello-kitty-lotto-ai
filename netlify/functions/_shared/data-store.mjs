import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

async function readJsonCandidates(relativePath) {
  const candidates = [
    path.resolve(moduleDir, '..', '..', '..', relativePath),
    path.resolve(process.cwd(), relativePath),
    path.resolve('/var/task', relativePath),
  ];
  let lastError;
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, 'utf8'));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to read included file ${relativePath}: ${lastError?.message || 'unknown error'}`);
}

export function lottoStore() {
  return getStore({ name: 'westlotto-live-data', consistency: 'strong' });
}

export async function loadSeedRecords() {
  const payload = await readJsonCandidates('assets/lotto-records.json');
  if (!Array.isArray(payload.records)) throw new Error('Seed records JSON is invalid');
  return payload.records;
}

export async function loadSeedStats() {
  return readJsonCandidates('assets/lotto-stats.json');
}

export async function loadRecords(store = lottoStore()) {
  const saved = await store.get('records', { type: 'json', consistency: 'strong' });
  if (saved?.records && Array.isArray(saved.records)) return saved.records;
  return loadSeedRecords();
}

export async function loadStats(store = lottoStore()) {
  const saved = await store.get('stats', { type: 'json' });
  if (saved?.main?.stats && saved?.dateRange) return saved;
  return loadSeedStats();
}

export async function saveData(records, stats, store = lottoStore()) {
  // Write stats first. If the second write fails, the next scheduled run can safely
  // rebuild from the still-old records. This avoids records advancing without stats.
  await store.setJSON('stats', stats, { metadata: { updatedAt: new Date().toISOString(), latestDraw: stats.dateRange.to } });
  await store.setJSON('records', { game: 'LOTTO 6aus49', records }, { metadata: { updatedAt: new Date().toISOString() } });
}
