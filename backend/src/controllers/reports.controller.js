const reportsModel = require("../models/reports.model");
const { toMonthRange, addMonths, formatMonth, isValidMonthString } = require("../utils/date");

const INDICATOR_COLUMNS = {
  wfa: "wfa_status",
  hfa: "hfa_status",
  wfl_h: "wfl_h_status",
};

function effectiveBarangay(req) {
  if (req.user.role === "BNS") return req.user.assigned_barangay;
  return req.query.barangay || null;
}

function tally(rows, column) {
  const counts = {};
  for (const row of rows) {
    const value = row[column];
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function filterByBarangay(rows, barangay) {
  if (!barangay) return rows;
  return rows.filter((row) => row.tbl_children?.barangay === barangay);
}

async function getNutritionReport(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = effectiveBarangay(req);
    const { start, end } = toMonthRange(month);

    const rows = filterByBarangay(await reportsModel.fetchAssessmentsWithBarangay({ start, end }), barangay);

    res.json({
      month,
      barangay: barangay || "All barangays",
      totalAssessments: rows.length,
      wfa: tally(rows, "wfa_status"),
      hfa: tally(rows, "hfa_status"),
      wfl_h: tally(rows, "wfl_h_status"),
    });
  } catch (err) {
    next(err);
  }
}

async function getVitaminReport(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = effectiveBarangay(req);
    const { start, end } = toMonthRange(month);

    const rows = filterByBarangay(await reportsModel.fetchSupplementsWithBarangay({ start, end }), barangay);
    const byType = tally(rows, "supplement_type");

    res.json({
      month,
      barangay: barangay || "All barangays",
      total: rows.length,
      vitaminA: byType["Vitamin A"] || 0,
      deworming: byType["Deworming"] || 0,
    });
  } catch (err) {
    next(err);
  }
}

async function getTrends(req, res, next) {
  try {
    const { from, to, status } = req.query;
    const indicatorKey = req.query.indicator;
    const column = INDICATOR_COLUMNS[indicatorKey];
    if (!isValidMonthString(from) || !isValidMonthString(to) || !column) {
      return res.status(400).json({ error: "from, to (YYYY-MM) and a valid indicator (wfa|hfa|wfl_h) are required" });
    }
    const barangay = req.query.barangay || null;

    const { start } = toMonthRange(from);
    const { end } = toMonthRange(to);
    const rows = filterByBarangay(await reportsModel.fetchAssessmentsWithBarangay({ start, end }), barangay);

    const buckets = new Map();
    let cursor = from;
    while (cursor <= to) {
      buckets.set(cursor, 0);
      cursor = addMonths(cursor, 1);
    }

    for (const row of rows) {
      if (status && row[column] !== status) continue;
      const month = formatMonth(row.date_measured);
      if (buckets.has(month)) {
        buckets.set(month, buckets.get(month) + 1);
      }
    }

    res.json(Array.from(buckets, ([month, count]) => ({ month, count })));
  } catch (err) {
    next(err);
  }
}

async function getBarangayComparison(req, res, next) {
  try {
    const { month, status } = req.query;
    const indicatorKey = req.query.indicator;
    const column = INDICATOR_COLUMNS[indicatorKey];
    if (!isValidMonthString(month) || !column) {
      return res.status(400).json({ error: "month (YYYY-MM) and a valid indicator (wfa|hfa|wfl_h) are required" });
    }

    const { start, end } = toMonthRange(month);
    const rows = await reportsModel.fetchAssessmentsWithBarangay({ start, end });

    const counts = new Map();
    for (const row of rows) {
      if (status && row[column] !== status) continue;
      const barangay = row.tbl_children?.barangay;
      if (!barangay) continue;
      counts.set(barangay, (counts.get(barangay) || 0) + 1);
    }

    const result = Array.from(counts, ([barangay, count]) => ({ barangay, count }));
    result.sort((a, b) => b.count - a.count);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getNutritionReport, getVitaminReport, getTrends, getBarangayComparison };
