const DEFAULT_SOURCES = [
  "https://www.westlotto.de/lotto-6aus49/gewinnzahlen/gewinnzahlen.html",
  "https://www.lotto.de/lotto-6aus49/lottozahlen",
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
    value.drawingDay ??
    value.drawDay ??
    value.gameDate ??
    value.lotteryDate ??
    value.lottoDate ??
    value.ziehungstag ??
    value.ziehungsdatum ??
    value.datum;
  let superNumber = value.superNumber ?? value.superzahl ?? value.superZahl ?? value.super ?? value.sz;
  const drawCollection = value.drawNumbersCollection ?? value.winningNumbersCollection;

  if (Array.isArray(drawCollection)) {
    const main = drawCollection
      .filter((item) => item && (item.drawNumberType === undefined || item.drawNumberType === 0 || item.type === "main" || item.type === "lotto"))
      .map((item) => item.drawNumber ?? item.number ?? item.value);
    const superItem = drawCollection.find(
      (item) => item && (item.drawNumberType === 1 || item.type === "super" || /super/i.test(String(item.drawNumberTypeName ?? item.name ?? ""))),
    );
    superNumber ??= superItem?.drawNumber ?? superItem?.number ?? superItem?.value;
    output.push({ date, main, super: superNumber, source });
  }

  for (const key of ["numbers", "drawNumbers", "drawingNumbers", "winningNumbers", "lottozahlen", "mainNumbers", "main", "zahlen", "gewinnzahlen"]) {
    if (Array.isArray(value[key])) {
      output.push({ date, main: value[key], super: superNumber, source });
    }
  }

  const numberedMain = [value.number1, value.number2, value.number3, value.number4, value.number5, value.number6];
  if (numberedMain.every((number) => number !== undefined)) {
    output.push({ date, main: numberedMain, super: superNumber, source });
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
    const scripts = text.matchAll(/<script[^>]+type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const script of scripts) {
      try {
        collectJsonCandidates(JSON.parse(script[1]), source, candidates);
      } catch {
        // Ignore unrelated structured data.
      }
    }
  }
  return candidates.map(validDraw).filter(Boolean);
}

function parseHtmlText(text, source) {
  const compact = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const draws = [];

  // WestLotto currently exposes plain text in this shape:
  // Ergebnisse vom Mittwoch, den 01.07.2026 2 4 5 13 41 48 Superzahl 4
  const westlotto = compact.match(
    /Ergebnisse\s+vom[\s\S]{0,80}?(\d{1,2}\.\d{1,2}\.(?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+Superzahl\D+(\d)/i,
  );
  if (westlotto) {
    const draw = validDraw({
      date: westlotto[1],
      main: westlotto.slice(2, 8).map(Number),
      super: Number(westlotto[8]),
      source,
    });
    if (draw) draws.push(draw);
  }

  // Generic fallback for pages that put the six LOTTO numbers near the text “Superzahl”.
  const date = parseDate(compact);
  const nearSuper = compact.match(
    /(?:LOTTO\s*6\s*aus\s*49|Gewinnzahlen|Lottozahlen)[\s\S]{0,1200}?(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+Superzahl\D+(\d)/i,
  );
  if (date && nearSuper) {
    const draw = validDraw({
      date,
      main: nearSuper.slice(1, 7).map(Number),
      super: Number(nearSuper[7]),
      source,
    });
    if (draw) draws.push(draw);
  }

  return draws;
}

async function readSource(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
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
