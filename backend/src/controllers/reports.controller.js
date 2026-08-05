const reportsModel = require("../models/reports.model");
const assessmentModel = require("../models/assessment.model");
const childrenModel = require("../models/children.model");
const barangayModel = require("../models/barangay.model");
const { toMonthRange, addMonths, formatMonth, isValidMonthString } = require("../utils/date");
const { filterSubmittedForRole } = require("../utils/submission");
const { classifyUnderweight, classifyStunting, classifyWasting, worstTier } = require("../utils/publicHealthSignificance");

const STATUS_VALUES = {
  wfa: ["Normal", "Underweight", "Severely Underweight", "Overweight"],
  hfa: ["Normal", "Stunted", "Severely Stunted", "Tall"],
  wfl_h: ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"],
};

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

// Operation Timbang Plus (OPT+) style age brackets, birth to 5 years.
const AGE_BRACKETS = [
  { key: "0-5", label: "0-5 Months", min: 0, max: 5 },
  { key: "6-11", label: "6-11 Months", min: 6, max: 11 },
  { key: "12-23", label: "12-23 Months", min: 12, max: 23 },
  { key: "24-35", label: "24-35 Months", min: 24, max: 35 },
  { key: "36-47", label: "36-47 Months", min: 36, max: 47 },
  { key: "48-59", label: "48-59 Months", min: 48, max: 59 },
];

function bracketForAge(ageInMonths) {
  return AGE_BRACKETS.find((b) => ageInMonths >= b.min && ageInMonths <= b.max) || null;
}

function genderKey(gender) {
  return String(gender || "").trim().toLowerCase().startsWith("f") ? "girls" : "boys";
}

function emptyBracketCounts() {
  const counts = {};
  for (const b of AGE_BRACKETS) counts[b.key] = { boys: 0, girls: 0, total: 0 };
  return counts;
}

function sumBracketCounts(counts) {
  return AGE_BRACKETS.reduce(
    (acc, b) => ({
      boys: acc.boys + counts[b.key].boys,
      girls: acc.girls + counts[b.key].girls,
      total: acc.total + counts[b.key].total,
    }),
    { boys: 0, girls: 0, total: 0 }
  );
}

async function getGrowthSummaryReport(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = effectiveBarangay(req);
    const { start, end } = toMonthRange(month);

    const scopedRows = filterByBarangay(await reportsModel.fetchAssessmentsWithChildren({ start, end }), barangay);
    const rows = filterSubmittedForRole(req, scopedRows).filter(
      (row) => row.tbl_children && bracketForAge(row.age_in_months)
    );
    const totalRegistered = await reportsModel.countChildren({ barangay });

    const overall = emptyBracketCounts();
    const indicators = {};
    for (const key of Object.keys(STATUS_VALUES)) {
      indicators[key] = {
        totalAssessed: 0,
        statuses: Object.fromEntries(STATUS_VALUES[key].map((s) => [s, emptyBracketCounts()])),
      };
    }

    for (const row of rows) {
      const bracket = bracketForAge(row.age_in_months);
      const gKey = genderKey(row.tbl_children.gender);

      overall[bracket.key][gKey] += 1;
      overall[bracket.key].total += 1;

      for (const [indicatorKey, column] of Object.entries(INDICATOR_COLUMNS)) {
        const status = row[column];
        const bucket = indicators[indicatorKey].statuses[status];
        if (!bucket) continue;
        indicators[indicatorKey].totalAssessed += 1;
        bucket[bracket.key][gKey] += 1;
        bucket[bracket.key].total += 1;
      }
    }

    const indicatorSummaries = {};
    for (const [indicatorKey, data] of Object.entries(indicators)) {
      const statuses = {};
      for (const [status, counts] of Object.entries(data.statuses)) {
        const total = sumBracketCounts(counts);
        statuses[status] = {
          byBracket: counts,
          total: total.total,
          prevPct: data.totalAssessed ? (total.total / data.totalAssessed) * 100 : 0,
        };
      }
      indicatorSummaries[indicatorKey] = { totalAssessed: data.totalAssessed, statuses };
    }

    res.json({
      month,
      barangay: barangay || "All Barangays",
      totalRegistered,
      ageBrackets: AGE_BRACKETS.map(({ key, label }) => ({ key, label })),
      overall: { byBracket: overall, total: sumBracketCounts(overall) },
      indicators: indicatorSummaries,
    });
  } catch (err) {
    next(err);
  }
}

async function getNutritionReport(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = effectiveBarangay(req);
    const { start, end } = toMonthRange(month);

    const scopedRows = filterByBarangay(await reportsModel.fetchAssessmentsWithBarangay({ start, end }), barangay);
    const rows = filterSubmittedForRole(req, scopedRows);

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

const MALNOURISHED_WFA = new Set(["Underweight", "Severely Underweight"]);
const STUNTED_HFA = new Set(["Stunted", "Severely Stunted"]);
const WASTED_WFL_H = new Set(["Wasted", "Severely Wasted"]);

async function getMonthlyMasterlistReport(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = effectiveBarangay(req);
    const { start, end } = toMonthRange(month);

    const scopedRows = filterByBarangay(await reportsModel.fetchAssessmentsWithChildren({ start, end }), barangay);
    const rawRows = filterSubmittedForRole(req, scopedRows);
    const totalRegistered = await reportsModel.countChildren({ barangay });

    const rows = rawRows
      .filter((row) => row.tbl_children)
      .map((row) => {
        const child = row.tbl_children;
        return {
          assessment_id: row.id,
          child_id: child.id,
          purok: child.purok,
          barangay: child.barangay,
          parent_name: child.parent_name,
          name: child.name,
          is_ip: child.is_ip,
          gender: child.gender,
          dob: child.dob,
          date_measured: row.date_measured,
          weight: row.weight,
          height: row.height,
          age_in_months: row.age_in_months,
          wfa_status: row.wfa_status,
          hfa_status: row.hfa_status,
          wfl_h_status: row.wfl_h_status,
        };
      })
      .sort((a, b) => a.purok?.localeCompare(b.purok) || a.name.localeCompare(b.name));

    let normal = 0;
    let malnourishedStunted = 0;
    let obese = 0;
    for (const row of rows) {
      if (row.wfa_status === "Normal" && row.hfa_status === "Normal" && row.wfl_h_status === "Normal") {
        normal += 1;
      }
      if (
        MALNOURISHED_WFA.has(row.wfa_status) ||
        STUNTED_HFA.has(row.hfa_status) ||
        WASTED_WFL_H.has(row.wfl_h_status)
      ) {
        malnourishedStunted += 1;
      }
      if (row.wfl_h_status === "Obese") {
        obese += 1;
      }
    }

    res.json({
      month,
      barangay: barangay || "All barangays",
      totalRegistered,
      normal,
      malnourishedStunted,
      obese,
      rows,
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
    const scopedRows = filterByBarangay(await reportsModel.fetchAssessmentsWithBarangay({ start, end }), barangay);
    const rows = filterSubmittedForRole(req, scopedRows);

    const months = [];
    let cursor = from;
    while (cursor <= to) {
      months.push(cursor);
      cursor = addMonths(cursor, 1);
    }

    if (status) {
      const buckets = new Map(months.map((m) => [m, 0]));
      for (const row of rows) {
        if (row[column] !== status) continue;
        const month = formatMonth(row.date_measured);
        if (buckets.has(month)) buckets.set(month, buckets.get(month) + 1);
      }
      return res.json(months.map((month) => ({ month, count: buckets.get(month) })));
    }

    // No status filter: break each month down by every status for this
    // indicator, so the caller can plot one line per status.
    const statuses = STATUS_VALUES[indicatorKey] || [];
    const buckets = new Map(months.map((m) => [m, Object.fromEntries(statuses.map((s) => [s, 0]))]));
    for (const row of rows) {
      const value = row[column];
      if (!statuses.includes(value)) continue;
      const month = formatMonth(row.date_measured);
      if (buckets.has(month)) buckets.get(month)[value] += 1;
    }

    res.json(months.map((month) => ({ month, ...buckets.get(month) })));
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
    const allRows = await reportsModel.fetchAssessmentsWithBarangay({ start, end });
    const rows = filterSubmittedForRole(req, allRows);

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

// Per-barangay underweight/stunted/wasted prevalence for the month, each
// classified against WHO's public-health-significance thresholds — powers
// the color-coded markers and side panel on the admin Barangay Map.
async function getBarangayHealthStatus(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }

    const { start, end } = toMonthRange(month);
    const allRows = await reportsModel.fetchAssessmentsWithBarangay({ start, end });
    const rows = filterSubmittedForRole(req, allRows);

    const totals = new Map();
    for (const b of barangayModel.getAll()) {
      totals.set(b.name, { barangay: b.name, totalAssessed: 0, underweight: 0, stunted: 0, wasted: 0 });
    }

    for (const row of rows) {
      const barangay = row.tbl_children?.barangay;
      const bucket = totals.get(barangay);
      if (!bucket) continue;
      bucket.totalAssessed += 1;
      if (MALNOURISHED_WFA.has(row.wfa_status)) bucket.underweight += 1;
      if (STUNTED_HFA.has(row.hfa_status)) bucket.stunted += 1;
      if (WASTED_WFL_H.has(row.wfl_h_status)) bucket.wasted += 1;
    }

    const barangays = Array.from(totals.values()).map((b) => {
      if (b.totalAssessed === 0) {
        return { ...b, underweightPct: 0, stuntedPct: 0, wastedPct: 0, severity: "no-data" };
      }
      const underweightPct = (b.underweight / b.totalAssessed) * 100;
      const stuntedPct = (b.stunted / b.totalAssessed) * 100;
      const wastedPct = (b.wasted / b.totalAssessed) * 100;
      const severity = worstTier(
        classifyUnderweight(underweightPct),
        classifyStunting(stuntedPct),
        classifyWasting(wastedPct)
      );
      return { ...b, underweightPct, stuntedPct, wastedPct, severity };
    });

    res.json({ month, barangays });
  } catch (err) {
    next(err);
  }
}

async function submitMonthlyReport(req, res, next) {
  try {
    const { month } = req.body;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = req.user.assigned_barangay;
    if (!barangay) {
      return res.status(400).json({ error: "No barangay is assigned to this account" });
    }

    const { start, end } = toMonthRange(month);
    const children = await childrenModel.findAll({ barangay });
    const childIds = children.map((c) => c.id);
    const updated = await assessmentModel.submitForChildren({ childIds, start, end });

    res.status(200).json({ barangay, month, submitted: true, count: updated.length });
  } catch (err) {
    next(err);
  }
}

async function getSubmissionStatus(req, res, next) {
  try {
    const { month } = req.query;
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const barangay = req.user.role === "BNS" ? req.user.assigned_barangay : req.query.barangay;
    if (!barangay) {
      return res.status(400).json({ error: "barangay is required" });
    }

    const { start, end } = toMonthRange(month);
    const rows = filterByBarangay(await reportsModel.fetchAssessmentsWithBarangay({ start, end }), barangay);
    const submitted = rows.length > 0 && rows.every((row) => row.submission_status === "submitted");

    res.json({ barangay, month, submitted, total: rows.length });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNutritionReport,
  getMonthlyMasterlistReport,
  getVitaminReport,
  getGrowthSummaryReport,
  getTrends,
  getBarangayComparison,
  getBarangayHealthStatus,
  submitMonthlyReport,
  getSubmissionStatus,
};
