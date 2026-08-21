const DEFAULT_SOURCES = [
  "https://www.lotto.de/lotto-6aus49/lottozahlen",
  "https://www.westlotto.de/lotto-6aus49/gewinnzahlen",
  "https://www.westlotto.de/lotto-6aus49/gewinnzahlen/gewinnzahlen.html",
  "https://m.westlotto.de/spielgemeinschaft/gewinnzahlen/gewinnzahlen.html",
  "https://m.westlotto.de/lotto-6aus49/normalschein/lotto-spielschein.html",
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

function parseNumberBallLayouts(text, source) {
  const draws = [];
  const layouts = text.matchAll(/<winning-ball-layout\b([\s\S]*?)<\/winning-ball-layout>/gi);
  for (const layout of layouts) {
    const block = layout[0];
    if (!/super-number-title=["']Superzahl["']/i.test(block)) continue;
    const date = parseDate(block);
    const mainSlot = block.match(/<template[^>]+v-slot:number-balls[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? block;
    const superSlot = block.match(/<template[^>]+v-slot:super-number-balls[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? "";
    const main = [...mainSlot.matchAll(/<number-ball\b[^>]*>\s*(\d{1,2})\s*<\/number-ball>/gi)].map((match) => Number(match[1]));
    const superNumber = superSlot.match(/<number-ball\b[^>]*>\s*(\d)\s*<\/number-ball>/i)?.[1];
    const draw = validDraw({ date, main, super: superNumber, source });
    if (draw) draws.push(draw);
  }
  return draws;
}

function parseHtmlText(text, source) {
  const compact = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const date = parseDate(compact);
  const candidates = [];
  const lottoLine =
    compact.match(/LOTTO\s*6\s*aus\s*49[^0-9]*(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})/i) ??
    compact.match(/(?:Gewinnzahlen|Lottozahlen)[^0-9]*(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})/i);
  const superLine = compact.match(/Superzahl[^0-9]*(\d)/i);
  if (!superLine) return [];
  const superIndex = compact.search(/Superzahl/i);
  const nearbyBeforeSuper = superIndex >= 0 ? compact.slice(Math.max(0, superIndex - 180), superIndex) : "";
  const nearbyNumbers = nearbyBeforeSuper.match(/\b\d{1,2}\b/g)?.map(Number).filter((number) => number >= 1 && number <= 49) ?? [];
  const superNumber = Number(superLine[1]);
  candidates.push({ date, main: nearbyNumbers.slice(-6), super: superNumber, source });
  if (lottoLine) candidates.push({ date, main: lottoLine.slice(1, 7).map(Number), super: superNumber, source });
  return candidates.map(validDraw).filter(Boolean);
}

async function readSource(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (compatible; HelloKittyLottoUpdater/1.0; +https://hellokittyno1.netlify.app)",
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
      const draws = [...parseJsonLike(text, source), ...parseNumberBallLayouts(text, source), ...parseHtmlText(text, source)];
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
