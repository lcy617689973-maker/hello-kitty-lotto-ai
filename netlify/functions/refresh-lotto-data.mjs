import { updateLottoData } from './_shared/update-core.mjs';

const parseManualDraw = (url) => {
  const date = url.searchParams.get('date');
  const mainRaw = url.searchParams.get('main');
  const superRaw = url.searchParams.get('super');
  if (!date && !mainRaw && superRaw == null) return null;
  if (!date || !mainRaw || superRaw == null) throw new Error('Manual mode requires date, main and super parameters together');
  const token = url.searchParams.get('token') || '';
  const expected = process.env.UPDATE_LOTTO_TOKEN || '';
  if (!expected || token !== expected) throw new Error('Manual data entry is disabled or the token is invalid');
  return { date, main: mainRaw.split(',').map(Number), super: Number(superRaw), source: 'manual-secured' };
};

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const manualDraw = parseManualDraw(url);
    const result = await updateLottoData({ manualDraw });
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Manual lotto refresh failed:', error);
    const status = /token|disabled/i.test(error.message) ? 403 : 500;
    return Response.json({ ok: false, error: error.message }, { status, headers: { 'cache-control': 'no-store' } });
  }
}
