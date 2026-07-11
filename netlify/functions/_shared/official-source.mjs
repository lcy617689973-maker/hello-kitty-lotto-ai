const WESTLOTTO_URL = 'https://www.westlotto.de/lotto-6aus49/gewinnzahlen/gewinnzahlen.html';
const LOTTO_DE_URL = 'https://www.lotto.de/lotto-6aus49/lottozahlen';

const MONTH_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const decodeHtml = (value) => value
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

export const htmlToText = (html) => decodeHtml(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const germanToIso = (date) => {
  const match = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const normalizeDate = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (MONTH_DAY_RE.test(trimmed)) return trimmed;
  return germanToIso(trimmed);
};

export function validateDraw(draw) {
  const date = normalizeDate(draw?.date);
  const main = Array.isArray(draw?.main) ? draw.main.map(Number).sort((a, b) => a - b) : [];
  const superNumber = draw?.super == null ? null : Number(draw.super);
  if (!date || main.length !== 6 || new Set(main).size !== 6) throw new Error('Draw date or six main numbers are invalid');
  if (main.some((number) => !Number.isInteger(number) || number < 1 || number > 49)) throw new Error('Main numbers must be unique integers from 1 to 49');
  if (!Number.isInteger(superNumber) || superNumber < 0 || superNumber > 9) throw new Error('Superzahl must be an integer from 0 to 9');
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) throw new Error(`Draw date ${date} is in the future`);
  return { date, main, super: superNumber, source: draw.source || 'official' };
}

export function parseOfficialHtml(html, source = 'westlotto-official') {
  const text = htmlToText(html);
  const patterns = [
    /Ergebnisse vom\s+(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s+den\s+(\d{2}\.\d{2}\.\d{4})\s+((?:\d{1,2}\s+){5}\d{1,2})\s+Superzahl\s+(\d)/i,
    /Ziehung vom\s+(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s+(\d{2}\.\d{2}\.\d{4})\s+((?:\d{1,2}\s+){5}\d{1,2})\s+Superzahl\s+(\d)/i,
    /(\d{2}\.\d{2}\.\d{4})\s+((?:\d{1,2}\s+){5}\d{1,2})\s+Superzahl\s+(\d)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return validateDraw({
      date: match[1],
      main: match[2].trim().split(/\s+/).map(Number),
      super: Number(match[3]),
      source,
    });
  }
  throw new Error('Official page was reachable, but no LOTTO 6aus49 draw could be parsed');
}

const firstMatching = (object, keys) => {
  if (!object || typeof object !== 'object') return undefined;
  for (const key of keys) {
    if (object[key] != null) return object[key];
  }
  return undefined;
};

function findDrawCandidate(value, depth = 0) {
  if (depth > 8 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDrawCandidate(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const mainRaw = firstMatching(value, ['main', 'numbers', 'winningNumbers', 'lottozahlen', 'gewinnzahlen', 'zahlen']);
  const superRaw = firstMatching(value, ['super', 'superzahl', 'superNumber', 'super_number']);
  const dateRaw = firstMatching(value, ['date', 'drawDate', 'drawingDate', 'ziehungsdatum', 'datum']);
  let main = mainRaw;
  if (typeof mainRaw === 'string') main = mainRaw.match(/\d{1,2}/g)?.map(Number);
  if (Array.isArray(main) && main.length >= 6 && superRaw != null && dateRaw != null) {
    try {
      return validateDraw({ date: String(dateRaw).slice(0, 10), main: main.slice(0, 6), super: superRaw, source: 'configured-official-json' });
    } catch {
      // Keep searching nested objects.
    }
  }

  for (const nested of Object.values(value)) {
    const found = findDrawCandidate(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; WestLottoStatsUpdater/1.0)',
        accept: options.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLatestOfficialDraw() {
  const failures = [];
  const configuredJson = process.env.LOTTO_LATEST_JSON_URL?.trim();
  if (configuredJson) {
    try {
      const response = await fetchWithTimeout(configuredJson, { accept: 'application/json,*/*;q=0.8' });
      const payload = await response.json();
      const draw = findDrawCandidate(payload);
      if (!draw) throw new Error('Configured JSON did not contain a recognizable draw');
      return draw;
    } catch (error) {
      failures.push(`configured JSON: ${error.message}`);
    }
  }

  for (const [url, source] of [[WESTLOTTO_URL, 'westlotto-official'], [LOTTO_DE_URL, 'lotto.de-official']]) {
    try {
      const response = await fetchWithTimeout(url);
      return parseOfficialHtml(await response.text(), source);
    } catch (error) {
      failures.push(`${source}: ${error.message}`);
    }
  }

  throw new Error(`All official data sources failed: ${failures.join(' | ')}`);
}
