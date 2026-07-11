import { buildStats } from './lotto-stats.mjs';
import { fetchLatestOfficialDraw, validateDraw } from './official-source.mjs';
import { loadRecords, lottoStore, saveData } from './data-store.mjs';

export async function updateLottoData({ manualDraw = null } = {}) {
  const store = lottoStore();
  const records = await loadRecords(store);
  const draw = validateDraw(manualDraw || await fetchLatestOfficialDraw());
  const previousLatest = records.at(-1)?.date || null;
  const existingIndex = records.findIndex((row) => row.date === draw.date);

  let status = 'unchanged';
  if (existingIndex >= 0) {
    const existing = records[existingIndex];
    const same = JSON.stringify(existing.main) === JSON.stringify(draw.main) && Number(existing.super) === draw.super;
    if (!same) {
      records[existingIndex] = draw;
      status = 'corrected';
    }
  } else if (!previousLatest || draw.date > previousLatest) {
    records.push(draw);
    status = 'updated';
  } else {
    return {
      ok: true,
      status: 'ignored-older-draw',
      fetchedDraw: draw,
      previousLatest,
      message: 'The official source returned an older draw; stored data was not changed.',
    };
  }

  if (status !== 'unchanged') {
    records.sort((a, b) => a.date.localeCompare(b.date));
    const stats = buildStats(records);
    await saveData(records, stats, store);
    return {
      ok: true,
      status,
      fetchedDraw: draw,
      previousLatest,
      latestStored: stats.dateRange.to,
      drawCount: stats.drawCount,
      generatedAt: stats.generatedAt,
    };
  }

  const savedStats = await store.get('stats', { type: 'json', consistency: 'strong' });
  if (!savedStats || savedStats.dateRange?.to !== previousLatest || savedStats.drawCount !== records.length) {
    const stats = buildStats(records);
    await saveData(records, stats, store);
    return {
      ok: true,
      status: 'repaired-stats',
      fetchedDraw: draw,
      previousLatest,
      latestStored: stats.dateRange.to,
      drawCount: stats.drawCount,
      generatedAt: stats.generatedAt,
    };
  }

  return {
    ok: true,
    status,
    fetchedDraw: draw,
    previousLatest,
    latestStored: previousLatest,
    drawCount: records.length,
    message: 'The latest official draw is already stored.',
  };
}
