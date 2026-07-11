import { loadStats } from './_shared/data-store.mjs';

export default async function handler() {
  try {
    const stats = await loadStats();
    return Response.json(stats, {
      headers: {
        'cache-control': 'public, max-age=30, stale-while-revalidate=120',
        'access-control-allow-origin': '*',
        'x-lotto-latest-draw': stats.dateRange?.to || 'unknown',
      },
    });
  } catch (error) {
    console.error('lotto-data failed', error);
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
