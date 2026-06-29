const DEFAULT_SOURCES = [
  "https://www.lotto.de/lotto-6aus49/lottozahlen",
  "https://www.westlotto.de/lotto-6aus49/gewinnzahlen",
];

function parseDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  const text = String(value);
  const iso = text.match(/(20\d{2}|19\d{2})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const german = text.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2}|19\d{2})/);
  if (german) {
    return `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  }
  return null;
}

function normalizeNumbers(values) {
  const numbers = [...new Set(values.map(Number))]
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= 49)
    .sort((a, b) => a - b);
  return numbers.length === 6 ? numbers : null;
}

function normalizeSuper(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 9 ? number : null;
}

function validDraw(candidate) {
  const date = parseDate(candidate.date);
  const main = normalizeNumbers(candidate.main ?? []);
  const superNumber = normalizeSuper(candidate.super);
  if (!date || !main || superNumber === null) return null;
  return { date, main, super: superNumber, source: candidate.source };
}

function collectJsonCandidates(value, source, output = []) {
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    for (const item of value) collectJsonCandidates(item, source, output);
    return output;
  }

  const date =
    value.drawDate ??
    value.date ??
    value.drawingDate ??
    value.lotteryDate ??
    value.ziehungstag ??
    value.ziehungsdatum ??
    value.datum;
  const superNumber = value.superNumber ?? value.superzahl ?? value.superZahl ?? value.super;
  const drawCollection = value.drawNumbersCollection ?? value.winningNumbersCollection;

  if (Array.isArray(drawCollection)) {
    const main = drawCollection
      .filter((item) => item && (item.drawNumberType === undefined || item.drawNumberType === 0 || item.type === "main"))
      .map((item) => item.drawNumber ?? item.number ?? item.value);
    output.push({ date, main, super: superNumber, source });
  }

  for (const key of ["numbers", "drawNumbers", "winningNumbers", "lottozahlen", "mainNumbers"]) {
    if (Array.isArray(value[key])) {
      output.push({ date, main: value[key], super: superNumber, source });
    }
  }

  for (const child of Object.values(value)) collectJsonCandidates(child, source, output);
  return output;
}

function parseJsonLike(text, source) {
  const candidates = [];
  try {
    collectJsonCandidates(JSON.parse(text), source, candidates);
  } catch {
    const nextData = text.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
    if (nextData) {
      try {
        collectJsonCandidates(JSON.parse(nextData[1]), source, candidates);
      } catch {
        // Ignore malformed embedded payloads.
      }
    }
  }
  return candidates.map(validDraw).filter(Boolean);
}

function parseHtmlText(text, source) {
  const compact = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const date = parseDate(compact);
  const lottoLine = compact.match(/LOTTO\s*6aus49[^0-9]*(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})/i);
  const superLine = compact.match(/Superzahl[^0-9]*(\d)/i);
  if (!lottoLine || !superLine) return [];
  const main = lottoLine.slice(1, 7).map(Number);
  const superNumber = Number(superLine[1]);
  const draw = validDraw({ date, main, super: superNumber, source });
  return draw ? [draw] : [];
}

async function readSource(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "hello-kitty-lotto-updater/1.0",
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

export async function fetchLatestDraw() {
  const configured = (process.env.LOTTO_LATEST_JSON_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const sources = [...configured, ...DEFAULT_SOURCES];
  const errors = [];

  for (const source of sources) {
    try {
      const text = await readSource(source);
      const draws = [...parseJsonLike(text, source), ...parseHtmlText(text, source)];
      if (draws.length) {
        return draws.sort((a, b) => b.date.localeCompare(a.date))[0];
      }
      errors.push(`${source}: no draw found`);
    } catch (error) {
      errors.push(`${source}: ${error.message}`);
    }
  }

  throw new Error(`No current draw could be parsed. ${errors.join(" | ")}`);
}
