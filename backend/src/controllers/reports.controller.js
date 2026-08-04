const reportsModel = require("../models/reports.model");
const assessmentModel = require("../models/assessment.model");
const childrenModel = require("../models/children.model");
const { toMonthRange, addMonths, formatMonth, isValidMonthString } = require("../utils/date");
const { filterSubmittedForRole } = require("../utils/submission");

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
  getTrends,
  getBarangayComparison,
  submitMonthlyReport,
  getSubmissionStatus,
};
