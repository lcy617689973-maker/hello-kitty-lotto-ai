#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from datetime import datetime
from itertools import combinations
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECORDS_PATH = ROOT / "assets" / "lotto-records.json"
STATS_PATH = ROOT / "assets" / "lotto-stats.json"


def stat_rows(counter, start, end, total=None):
    if total is None:
        total = sum(counter.get(n, 0) for n in range(start, end + 1))
    return [
        {
            "number": n,
            "count": counter.get(n, 0),
            "rate": round(counter.get(n, 0) / total, 6) if total else 0,
        }
        for n in range(start, end + 1)
    ]


def main():
    payload = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
    records = sorted(payload["records"], key=lambda row: row["date"])
    draw_count = len(records)

    main_counts = Counter(n for row in records for n in row["main"])
    super_counts = Counter(row["super"] for row in records if row["super"] is not None)
    main_stats = stat_rows(main_counts, 1, 49)
    super_stats = stat_rows(super_counts, 0, 9)

    windows = {}
    for size in (20, 50, 100, 300):
        sample = records[-size:]
        counts = Counter(n for row in sample for n in row["main"])
        rows = stat_rows(counts, 1, 49, size * 6)
        windows[str(size)] = {
            "stats": rows,
            "hot": sorted(rows, key=lambda row: (-row["count"], row["number"]))[:12],
            "cold": sorted(rows, key=lambda row: (row["count"], row["number"]))[:12],
        }

    last_seen = {}
    positions = defaultdict(list)
    for index, row in enumerate(records):
        for number in row["main"]:
            last_seen[number] = index
            positions[number].append(index)

    intervals = []
    for number in range(1, 50):
        pos = positions[number]
        gaps = [b - a for a, b in zip(pos, pos[1:])]
        intervals.append(
            {
                "number": number,
                "count": main_counts.get(number, 0),
                "avgGap": round(sum(gaps) / len(gaps), 1) if gaps else None,
                "currentMiss": draw_count - 1 - last_seen.get(number, -1),
                "lastSeen": records[last_seen[number]]["date"] if number in last_seen else None,
            }
        )

    pair_counts = Counter()
    consecutive_pair_counts = Counter()
    sums = []
    patterns = Counter()
    tails = Counter()
    zones = Counter()
    for row in records:
        nums = row["main"]
        sums.append(sum(nums))
        odd = sum(n % 2 for n in nums)
        small = sum(n <= 24 for n in nums)
        consecutive = sum(1 for a, b in zip(nums, nums[1:]) if b == a + 1)
        zone = (
            sum(1 <= n <= 16 for n in nums),
            sum(17 <= n <= 33 for n in nums),
            sum(34 <= n <= 49 for n in nums),
        )
        patterns[f"odd{odd}"] += 1
        patterns[f"small{small}"] += 1
        patterns[f"consecutive{consecutive}"] += 1
        zones["-".join(map(str, zone))] += 1
        for number in nums:
            tails[number % 10] += 1
        for a, b in combinations(nums, 2):
            pair_counts[(a, b)] += 1
            if b == a + 1:
                consecutive_pair_counts[(a, b)] += 1

    sum_buckets = Counter((value // 10) * 10 for value in sums)
    all_sum_buckets = range(20, 271, 10)
    all_zones = [(low, mid, 6 - low - mid) for low in range(7) for mid in range(7 - low)]
    years = [int(row["date"][:4]) for row in records]
    start_year = years[0]
    end_year = years[-1]
    bin_size = 5
    bins = []
    year = (start_year // bin_size) * bin_size
    while year <= end_year:
        bins.append((year, min(year + bin_size - 1, end_year)))
        year += bin_size

    trend = {str(number): [] for number in range(1, 50)}
    bin_totals = []
    for start, end in bins:
        sample = [row for row in records if start <= int(row["date"][:4]) <= end]
        counts = Counter(n for row in sample for n in row["main"])
        label = f"{start}-{end}"
        bin_totals.append(len(sample))
        for number in range(1, 50):
            trend[str(number)].append(
                {
                    "label": label,
                    "count": counts.get(number, 0),
                    "rate": round(counts.get(number, 0) / (len(sample) * 6), 5) if sample else 0,
                }
            )

    pattern_rows = {
        "oddEven": [
            {"label": f"奇数{n}", "count": patterns.get(f"odd{n}", 0), "rate": round(patterns.get(f"odd{n}", 0) / draw_count, 4)}
            for n in range(7)
        ],
        "smallLarge": [
            {"label": f"小号{n}", "count": patterns.get(f"small{n}", 0), "rate": round(patterns.get(f"small{n}", 0) / draw_count, 4)}
            for n in range(7)
        ],
        "consecutive": [
            {
                "label": f"连号{n}",
                "count": patterns.get(f"consecutive{n}", 0),
                "rate": round(patterns.get(f"consecutive{n}", 0) / draw_count, 4),
            }
            for n in range(7)
        ],
        "zones": [
            {
                "label": "-".join(map(str, zone)),
                "count": zones.get("-".join(map(str, zone)), 0),
                "rate": round(zones.get("-".join(map(str, zone)), 0) / draw_count, 4),
            }
            for zone in all_zones
        ],
        "tails": [{"number": n, "count": tails.get(n, 0), "rate": round(tails.get(n, 0) / (draw_count * 6), 4)} for n in range(10)],
        "sumBuckets": [
            {"label": f"{key}-{key + 9}", "count": sum_buckets.get(key, 0), "rate": round(sum_buckets.get(key, 0) / draw_count, 4)}
            for key in all_sum_buckets
        ],
    }

    stats = {
        "game": "LOTTO 6aus49",
        "sourceNote": "Westlotto / LOTTO.de historical draw data maintained by the site owner automation.",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "drawCount": draw_count,
        "dateRange": {"from": records[0]["date"], "to": records[-1]["date"]},
        "main": {
            "range": [1, 49],
            "numbersPerDraw": 6,
            "stats": main_stats,
            "hot": sorted(main_stats, key=lambda row: (-row["count"], row["number"]))[:16],
            "cold": sorted(main_stats, key=lambda row: (row["count"], row["number"]))[:16],
            "intervals": intervals,
        },
        "super": {
            "range": [0, 9],
            "numbersPerDraw": 1,
            "stats": super_stats,
            "hot": sorted(super_stats, key=lambda row: (-row["count"], row["number"]))[:6],
            "cold": sorted(super_stats, key=lambda row: (row["count"], row["number"]))[:6],
        },
        "windows": windows,
        "patterns": pattern_rows,
        "sum": {
            "average": round(sum(sums) / len(sums), 1),
            "min": min(sums),
            "max": max(sums),
            "commonBuckets": pattern_rows["sumBuckets"],
        },
        "pairs": {
            "common": [{"pair": list(pair), "count": count} for pair, count in pair_counts.most_common(24)],
            "consecutive": [{"pair": list(pair), "count": count} for pair, count in consecutive_pair_counts.most_common(12)],
        },
        "trend": {
            "binSizeYears": bin_size,
            "bins": [{"label": f"{start}-{end}", "draws": total} for (start, end), total in zip(bins, bin_totals)],
            "numbers": trend,
        },
        "recentDraws": records[-20:],
    }

    STATS_PATH.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"rebuilt {STATS_PATH} with {draw_count} draws through {records[-1]['date']}")


if __name__ == "__main__":
    main()
