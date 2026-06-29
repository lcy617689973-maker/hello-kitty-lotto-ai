const MAIN_START = 1;
const MAIN_END = 49;
const SUPER_START = 0;
const SUPER_END = 9;

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getCount(map, key) {
  return map.get(key) ?? 0;
}

function statRows(counter, start, end, total = null) {
  const denominator = total ?? range(start, end).reduce((sum, n) => sum + getCount(counter, n), 0);
  return range(start, end).map((number) => ({
    number,
    count: getCount(counter, number),
    rate: denominator ? Number((getCount(counter, number) / denominator).toFixed(6)) : 0,
  }));
}

function byHot(a, b) {
  return b.count - a.count || a.number - b.number;
}

function byCold(a, b) {
  return a.count - b.count || a.number - b.number;
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

export function normalizeRecords(records) {
  return records
    .map((row) => ({
      date: row.date,
      main: [...row.main].map(Number).sort((a, b) => a - b),
      super: row.super === null || row.super === undefined || row.super === "" ? null : Number(row.super),
      source: row.source ?? "manual",
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.main.length === 6)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildStats(inputRecords) {
  const records = normalizeRecords(inputRecords);
  const drawCount = records.length;
  if (!drawCount) {
    throw new Error("Cannot build statistics without records");
  }

  const mainCounts = new Map();
  const superCounts = new Map();
  for (const row of records) {
    for (const number of row.main) addCount(mainCounts, number);
    if (row.super !== null) addCount(superCounts, row.super);
  }

  const mainStats = statRows(mainCounts, MAIN_START, MAIN_END);
  const superStats = statRows(superCounts, SUPER_START, SUPER_END);
  const windows = {};
  for (const size of [20, 50, 100, 300]) {
    const sample = records.slice(-size);
    const counts = new Map();
    for (const row of sample) {
      for (const number of row.main) addCount(counts, number);
    }
    const rows = statRows(counts, MAIN_START, MAIN_END, sample.length * 6);
    windows[String(size)] = {
      stats: rows,
      hot: [...rows].sort(byHot).slice(0, 12),
      cold: [...rows].sort(byCold).slice(0, 12),
    };
  }

  const lastSeen = new Map();
  const positions = new Map(range(MAIN_START, MAIN_END).map((number) => [number, []]));
  records.forEach((row, index) => {
    for (const number of row.main) {
      lastSeen.set(number, index);
      positions.get(number).push(index);
    }
  });

  const intervals = range(MAIN_START, MAIN_END).map((number) => {
    const pos = positions.get(number) ?? [];
    const gaps = pos.slice(1).map((value, index) => value - pos[index]);
    const lastIndex = lastSeen.get(number);
    return {
      number,
      count: getCount(mainCounts, number),
      avgGap: gaps.length ? Number((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length).toFixed(1)) : null,
      currentMiss: lastIndex === undefined ? drawCount : drawCount - 1 - lastIndex,
      lastSeen: lastIndex === undefined ? null : records[lastIndex].date,
    };
  });

  const pairCounts = new Map();
  const consecutivePairCounts = new Map();
  const sums = [];
  const patterns = new Map();
  const tails = new Map();
  const zones = new Map();

  for (const row of records) {
    const nums = row.main;
    const sum = nums.reduce((total, number) => total + number, 0);
    sums.push(sum);
    const odd = nums.filter((number) => number % 2).length;
    const small = nums.filter((number) => number <= 24).length;
    const consecutive = nums.slice(1).filter((number, index) => number === nums[index] + 1).length;
    const zone = [
      nums.filter((number) => number >= 1 && number <= 16).length,
      nums.filter((number) => number >= 17 && number <= 33).length,
      nums.filter((number) => number >= 34 && number <= 49).length,
    ].join("-");
    addCount(patterns, `odd${odd}`);
    addCount(patterns, `small${small}`);
    addCount(patterns, `consecutive${consecutive}`);
    addCount(zones, zone);
    for (const number of nums) addCount(tails, number % 10);
    for (let i = 0; i < nums.length; i += 1) {
      for (let j = i + 1; j < nums.length; j += 1) {
        const pair = `${nums[i]}-${nums[j]}`;
        addCount(pairCounts, pair);
        if (nums[j] === nums[i] + 1) addCount(consecutivePairCounts, pair);
      }
    }
  }

  const sumBuckets = new Map();
  for (const value of sums) addCount(sumBuckets, Math.floor(value / 10) * 10);
  const allZones = [];
  for (let low = 0; low <= 6; low += 1) {
    for (let mid = 0; mid <= 6 - low; mid += 1) {
      allZones.push([low, mid, 6 - low - mid]);
    }
  }

  const startYear = Number(records[0].date.slice(0, 4));
  const endYear = Number(records.at(-1).date.slice(0, 4));
  const binSize = 5;
  const bins = [];
  for (let year = Math.floor(startYear / binSize) * binSize; year <= endYear; year += binSize) {
    bins.push([year, Math.min(year + binSize - 1, endYear)]);
  }

  const trend = Object.fromEntries(range(MAIN_START, MAIN_END).map((number) => [String(number), []]));
  const binTotals = [];
  for (const [start, end] of bins) {
    const sample = records.filter((row) => {
      const year = Number(row.date.slice(0, 4));
      return year >= start && year <= end;
    });
    const counts = new Map();
    for (const row of sample) {
      for (const number of row.main) addCount(counts, number);
    }
    const label = `${start}-${end}`;
    binTotals.push(sample.length);
    for (const number of range(MAIN_START, MAIN_END)) {
      trend[String(number)].push({
        label,
        count: getCount(counts, number),
        rate: sample.length ? Number((getCount(counts, number) / (sample.length * 6)).toFixed(5)) : 0,
      });
    }
  }

  const patternRows = {
    oddEven: range(0, 6).map((number) => ({
      label: `奇数${number}`,
      count: getCount(patterns, `odd${number}`),
      rate: Number((getCount(patterns, `odd${number}`) / drawCount).toFixed(4)),
    })),
    smallLarge: range(0, 6).map((number) => ({
      label: `小号${number}`,
      count: getCount(patterns, `small${number}`),
      rate: Number((getCount(patterns, `small${number}`) / drawCount).toFixed(4)),
    })),
    consecutive: range(0, 6).map((number) => ({
      label: `连号${number}`,
      count: getCount(patterns, `consecutive${number}`),
      rate: Number((getCount(patterns, `consecutive${number}`) / drawCount).toFixed(4)),
    })),
    zones: allZones.map((zone) => {
      const label = zone.join("-");
      return { label, count: getCount(zones, label), rate: Number((getCount(zones, label) / drawCount).toFixed(4)) };
    }),
    tails: range(0, 9).map((number) => ({
      number,
      count: getCount(tails, number),
      rate: Number((getCount(tails, number) / (drawCount * 6)).toFixed(4)),
    })),
    sumBuckets: range(20, 270)
      .filter((key) => key % 10 === 0)
      .map((key) => ({
        label: `${key}-${key + 9}`,
        count: getCount(sumBuckets, key),
        rate: Number((getCount(sumBuckets, key) / drawCount).toFixed(4)),
      })),
  };

  return {
    game: "LOTTO 6aus49",
    sourceNote: "Westlotto / LOTTO.de historical draw data maintained by Netlify automation.",
    generatedAt: new Date().toISOString(),
    drawCount,
    dateRange: { from: records[0].date, to: records.at(-1).date },
    main: {
      range: [MAIN_START, MAIN_END],
      numbersPerDraw: 6,
      stats: mainStats,
      hot: [...mainStats].sort(byHot).slice(0, 16),
      cold: [...mainStats].sort(byCold).slice(0, 16),
      intervals,
    },
    super: {
      range: [SUPER_START, SUPER_END],
      numbersPerDraw: 1,
      stats: superStats,
      hot: [...superStats].sort(byHot).slice(0, 6),
      cold: [...superStats].sort(byCold).slice(0, 6),
    },
    windows,
    patterns: patternRows,
    sum: {
      average: Number((sums.reduce((total, value) => total + value, 0) / sums.length).toFixed(1)),
      min: Math.min(...sums),
      max: Math.max(...sums),
      commonBuckets: patternRows.sumBuckets,
    },
    pairs: {
      common: topEntries(pairCounts, 24).map(([pair, count]) => ({ pair: pair.split("-").map(Number), count })),
      consecutive: topEntries(consecutivePairCounts, 12).map(([pair, count]) => ({ pair: pair.split("-").map(Number), count })),
    },
    trend: {
      binSizeYears: binSize,
      bins: bins.map(([start, end], index) => ({ label: `${start}-${end}`, draws: binTotals[index] })),
      numbers: trend,
    },
    recentDraws: records.slice(-20),
  };
}
