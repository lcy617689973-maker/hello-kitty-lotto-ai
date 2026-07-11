const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const countValues = (values) => {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return map;
};

const statRows = (counter, start, end, total = null) => {
  const denominator = total ?? Array.from({ length: end - start + 1 }, (_, i) => counter.get(start + i) || 0)
    .reduce((sum, value) => sum + value, 0);
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const number = start + i;
    const count = counter.get(number) || 0;
    return { number, count, rate: denominator ? round(count / denominator, 6) : 0 };
  });
};

const combinations2 = (values) => {
  const pairs = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) pairs.push([values[i], values[j]]);
  }
  return pairs;
};

const increment = (map, key, amount = 1) => map.set(key, (map.get(key) || 0) + amount);

const topEntries = (map, limit) => [...map.entries()]
  .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
  .slice(0, limit);

export function buildStats(inputRecords) {
  const records = [...inputRecords]
    .map((row) => ({ ...row, main: [...row.main].map(Number).sort((a, b) => a - b), super: row.super == null ? null : Number(row.super) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!records.length) throw new Error('No lotto records available');

  const drawCount = records.length;
  const mainCounts = countValues(records.flatMap((row) => row.main));
  const superValues = records.filter((row) => row.super != null).map((row) => row.super);
  const superCounts = countValues(superValues);
  const superRecordedCount = superValues.length;
  const mainStats = statRows(mainCounts, 1, 49);
  const superStats = statRows(superCounts, 0, 9);

  const windows = {};
  for (const size of [20, 50, 100, 300]) {
    const sample = records.slice(-size);
    const counts = countValues(sample.flatMap((row) => row.main));
    const rows = statRows(counts, 1, 49, sample.length * 6);
    windows[String(size)] = {
      stats: rows,
      hot: [...rows].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, 12),
      cold: [...rows].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, 12),
    };
  }

  const lastSeen = new Map();
  const positions = new Map();
  records.forEach((row, index) => {
    row.main.forEach((number) => {
      lastSeen.set(number, index);
      if (!positions.has(number)) positions.set(number, []);
      positions.get(number).push(index);
    });
  });

  const intervals = [];
  for (let number = 1; number <= 49; number += 1) {
    const pos = positions.get(number) || [];
    const gaps = pos.slice(1).map((value, index) => value - pos[index]);
    const lastIndex = lastSeen.has(number) ? lastSeen.get(number) : -1;
    intervals.push({
      number,
      count: mainCounts.get(number) || 0,
      avgGap: gaps.length ? round(gaps.reduce((a, b) => a + b, 0) / gaps.length, 1) : null,
      currentMiss: drawCount - 1 - lastIndex,
      lastSeen: lastIndex >= 0 ? records[lastIndex].date : null,
    });
  }

  const pairCounts = new Map();
  const consecutivePairCounts = new Map();
  const sums = [];
  const patterns = new Map();
  const tails = new Map();
  const zones = new Map();

  for (const row of records) {
    const nums = row.main;
    sums.push(nums.reduce((a, b) => a + b, 0));
    const odd = nums.filter((n) => n % 2).length;
    const small = nums.filter((n) => n <= 24).length;
    const consecutive = nums.slice(1).filter((n, i) => n === nums[i] + 1).length;
    const zone = [
      nums.filter((n) => n >= 1 && n <= 16).length,
      nums.filter((n) => n >= 17 && n <= 33).length,
      nums.filter((n) => n >= 34 && n <= 49).length,
    ];
    increment(patterns, `odd${odd}`);
    increment(patterns, `small${small}`);
    increment(patterns, `consecutive${consecutive}`);
    increment(zones, zone.join('-'));
    nums.forEach((number) => increment(tails, number % 10));
    combinations2(nums).forEach(([a, b]) => {
      increment(pairCounts, `${a},${b}`);
      if (b === a + 1) increment(consecutivePairCounts, `${a},${b}`);
    });
  }

  const sumBuckets = new Map();
  sums.forEach((value) => increment(sumBuckets, Math.floor(value / 10) * 10));
  const allSumBuckets = Array.from({ length: 26 }, (_, i) => 20 + i * 10);
  const allZones = [];
  for (let low = 0; low <= 6; low += 1) {
    for (let mid = 0; mid <= 6 - low; mid += 1) allZones.push([low, mid, 6 - low - mid]);
  }

  const years = records.map((row) => Number(row.date.slice(0, 4)));
  const startYear = years[0];
  const endYear = years.at(-1);
  const binSize = 5;
  const bins = [];
  for (let year = Math.floor(startYear / binSize) * binSize; year <= endYear; year += binSize) {
    bins.push([year, Math.min(year + binSize - 1, endYear)]);
  }

  const trend = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [String(i + 1), []]));
  const binTotals = [];
  for (const [start, end] of bins) {
    const sample = records.filter((row) => {
      const year = Number(row.date.slice(0, 4));
      return year >= start && year <= end;
    });
    const counts = countValues(sample.flatMap((row) => row.main));
    const label = `${start}-${end}`;
    binTotals.push(sample.length);
    for (let number = 1; number <= 49; number += 1) {
      const count = counts.get(number) || 0;
      trend[String(number)].push({
        label,
        count,
        rate: sample.length ? round(count / (sample.length * 6), 5) : 0,
      });
    }
  }

  const patternRows = {
    oddEven: Array.from({ length: 7 }, (_, n) => ({
      label: `奇数${n}`,
      count: patterns.get(`odd${n}`) || 0,
      rate: round((patterns.get(`odd${n}`) || 0) / drawCount, 4),
    })),
    smallLarge: Array.from({ length: 7 }, (_, n) => ({
      label: `小号${n}`,
      count: patterns.get(`small${n}`) || 0,
      rate: round((patterns.get(`small${n}`) || 0) / drawCount, 4),
    })),
    consecutive: Array.from({ length: 7 }, (_, n) => ({
      label: `连号${n}`,
      count: patterns.get(`consecutive${n}`) || 0,
      rate: round((patterns.get(`consecutive${n}`) || 0) / drawCount, 4),
    })),
    zones: allZones.map((zone) => {
      const key = zone.join('-');
      const count = zones.get(key) || 0;
      return { label: key, count, rate: round(count / drawCount, 4) };
    }),
    tails: Array.from({ length: 10 }, (_, n) => {
      const count = tails.get(n) || 0;
      return { number: n, count, rate: round(count / (drawCount * 6), 4) };
    }),
    sumBuckets: allSumBuckets.map((key) => {
      const count = sumBuckets.get(key) || 0;
      return { label: `${key}-${key + 9}`, count, rate: round(count / drawCount, 4) };
    }),
  };

  return {
    game: 'LOTTO 6aus49',
    sourceNote: 'WestLotto official draw page; persisted by Netlify Scheduled Functions and Netlify Blobs.',
    generatedAt: new Date().toISOString(),
    drawCount,
    dateRange: { from: records[0].date, to: records.at(-1).date },
    main: {
      range: [1, 49],
      numbersPerDraw: 6,
      stats: mainStats,
      hot: [...mainStats].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, 16),
      cold: [...mainStats].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, 16),
      intervals,
    },
    super: {
      range: [0, 9],
      numbersPerDraw: 1,
      recordedDrawCount: superRecordedCount,
      missingDrawCount: drawCount - superRecordedCount,
      stats: superStats,
      hot: [...superStats].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, 6),
      cold: [...superStats].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, 6),
    },
    windows,
    patterns: patternRows,
    sum: {
      average: round(sums.reduce((a, b) => a + b, 0) / sums.length, 1),
      min: Math.min(...sums),
      max: Math.max(...sums),
      commonBuckets: patternRows.sumBuckets,
    },
    pairs: {
      common: topEntries(pairCounts, 24).map(([key, count]) => ({ pair: key.split(',').map(Number), count })),
      consecutive: topEntries(consecutivePairCounts, 12).map(([key, count]) => ({ pair: key.split(',').map(Number), count })),
    },
    trend: {
      binSizeYears: binSize,
      bins: bins.map(([start, end], index) => ({ label: `${start}-${end}`, draws: binTotals[index] })),
      numbers: trend,
    },
    recentDraws: records.slice(-20),
  };
}
