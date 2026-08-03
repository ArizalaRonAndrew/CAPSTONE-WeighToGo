const assessmentModel = require("../models/assessment.model");
const childrenModel = require("../models/children.model");
const reportsModel = require("../models/reports.model");
const { calculateAgeInMonths, formatMonth } = require("../utils/date");
const { classifyNutritionStatus } = require("../services/nutritionStatus.service");
const { assertBarangayAccess } = require("../utils/access");

// Admins only see assessments for a barangay+month once the assigned BNS has
// submitted that month's report. BNS users always see their own data live.
async function filterSubmittedForRole(req, assessments, { barangay } = {}) {
  if (req.user.role !== "MNAO") return assessments;
  const submittedSet = await reportsModel.fetchSubmittedSet(barangay ? { barangay } : {});
  return assessments.filter((a) => {
    const rowBarangay = barangay || a.tbl_children?.barangay;
    if (!rowBarangay) return false;
    return submittedSet.has(`${rowBarangay}|${formatMonth(a.date_measured)}`);
  });
}

function stripBarangay({ tbl_children: _tbl_children, ...rest }) {
  return rest;
}

async function listAssessments(req, res, next) {
  try {
    const { childId, status } = req.query;

    if (childId) {
      const child = await childrenModel.findById(childId);
      assertBarangayAccess(req, child);
      const assessments = await assessmentModel.findAll({ childId, status });
      const visible = await filterSubmittedForRole(req, assessments, { barangay: child.barangay });
      return res.json(visible);
    }

    if (req.user.role === "BNS") {
      const children = await childrenModel.findAll({ barangay: req.user.assigned_barangay });
      const childIds = children.map((c) => c.id);
      const assessments = childIds.length ? await assessmentModel.findAll({ childIds, status }) : [];
      return res.json(assessments);
    }

    const assessments = await assessmentModel.findAllWithBarangay({ status });
    const visible = await filterSubmittedForRole(req, assessments);
    res.json(visible.map(stripBarangay));
  } catch (err) {
    next(err);
  }
}

async function getAssessment(req, res, next) {
  try {
    const assessment = await assessmentModel.findById(req.params.id);
    const child = await childrenModel.findById(assessment.child_id);
    assertBarangayAccess(req, child);
    const [visible] = await filterSubmittedForRole(req, [assessment], { barangay: child.barangay });
    if (!visible) {
      const err = new Error("This checkup has not been submitted to the admin yet");
      err.status = 404;
      throw err;
    }
    res.json(visible);
  } catch (err) {
    next(err);
  }
}

async function createAssessment(req, res, next) {
  try {
    const { child_id, date_measured, weight, height } = req.body;
    if (!child_id || !date_measured || weight == null || height == null) {
      return res.status(400).json({
        error: "child_id, date_measured, weight, and height are required",
      });
    }

    const child = await childrenModel.findById(child_id);
    assertBarangayAccess(req, child);

    const age_in_months = calculateAgeInMonths(child.dob, date_measured);
    const { wfa_status, hfa_status, wfl_h_status } = classifyNutritionStatus({
      sex: child.gender,
      ageInMonths: age_in_months,
      weightKg: Number(weight),
      heightCm: Number(height),
    });

    const assessment = await assessmentModel.create({
      child_id,
      date_measured,
      weight,
      height,
      age_in_months,
      wfa_status,
      hfa_status,
      wfl_h_status,
    });
    res.status(201).json(assessment);
  } catch (err) {
    next(err);
  }
}

async function updateAssessment(req, res, next) {
  try {
    const existing = await assessmentModel.findById(req.params.id);
    const child = await childrenModel.findById(existing.child_id);
    assertBarangayAccess(req, child);

    const assessment = await assessmentModel.update(req.params.id, req.body);
    res.json(assessment);
  } catch (err) {
    next(err);
  }
}

async function deleteAssessment(req, res, next) {
  try {
    const existing = await assessmentModel.findById(req.params.id);
    const child = await childrenModel.findById(existing.child_id);
    assertBarangayAccess(req, child);

    const assessment = await assessmentModel.softDelete(req.params.id);
    res.json(assessment);
  } catch (err) {
    next(err);
  }
}

module.exports = { listAssessments, getAssessment, createAssessment, updateAssessment, deleteAssessment };
