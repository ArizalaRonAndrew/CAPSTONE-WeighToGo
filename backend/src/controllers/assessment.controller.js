const assessmentModel = require("../models/assessment.model");
const childrenModel = require("../models/children.model");
const { calculateAgeInMonths } = require("../utils/date");
const { classifyNutritionStatus } = require("../services/nutritionStatus.service");
const { assertBarangayAccess } = require("../utils/access");
const { filterSubmittedForRole } = require("../utils/submission");
const { pickFields } = require("../utils/pickFields");

// child_id and the status columns are deliberately excluded: child_id must
// never be reassignable through an update (that's how a record could get
// silently moved to a child outside the caller's barangay access), and the
// wfa/hfa/wfl_h statuses are always server-computed from weight/height/age,
// never client-settable.
const ASSESSMENT_UPDATE_FIELDS = ["date_measured", "weight", "height"];

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
      return res.json(filterSubmittedForRole(req, assessments));
    }

    if (req.user.role === "BNS") {
      const children = await childrenModel.findAll({ barangay: req.user.assigned_barangay });
      const childIds = children.map((c) => c.id);
      const assessments = childIds.length ? await assessmentModel.findAll({ childIds, status }) : [];
      return res.json(assessments);
    }

    const assessments = await assessmentModel.findAllWithBarangay({ status });
    res.json(filterSubmittedForRole(req, assessments).map(stripBarangay));
  } catch (err) {
    next(err);
  }
}

async function getAssessment(req, res, next) {
  try {
    const assessment = await assessmentModel.findById(req.params.id);
    const child = await childrenModel.findById(assessment.child_id);
    assertBarangayAccess(req, child);
    const [visible] = filterSubmittedForRole(req, [assessment]);
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

    const existingAssessments = await assessmentModel.findAll({ childId: child_id });
    const targetMonth = date_measured.slice(0, 7);
    const alreadyAssessed = existingAssessments.some(
      (a) => a.date_measured?.slice(0, 7) === targetMonth
    );
    if (alreadyAssessed) {
      return res.status(409).json({
        error: "This child has already been assessed for this month.",
      });
    }

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

// Computes what wfa/hfa/wfl_h status would be for the given measurements
// without creating a record, so the UI can show a live preview as the BNS
// types weight/height, before they commit to saving the checkup.
async function previewAssessment(req, res, next) {
  try {
    const { child_id, date_measured, weight, height } = req.body;
    if (!child_id || weight == null || height == null) {
      return res.status(400).json({ error: "child_id, weight, and height are required" });
    }

    const child = await childrenModel.findById(child_id);
    assertBarangayAccess(req, child);

    const effectiveDate = date_measured || new Date().toISOString().slice(0, 10);
    const age_in_months = calculateAgeInMonths(child.dob, effectiveDate);
    const status = classifyNutritionStatus({
      sex: child.gender,
      ageInMonths: age_in_months,
      weightKg: Number(weight),
      heightCm: Number(height),
    });

    res.json({ ...status, age_in_months });
  } catch (err) {
    next(err);
  }
}

async function updateAssessment(req, res, next) {
  try {
    const existing = await assessmentModel.findById(req.params.id);
    const child = await childrenModel.findById(existing.child_id);
    assertBarangayAccess(req, child);

    const fields = pickFields(req.body, ASSESSMENT_UPDATE_FIELDS);

    // Any change to the inputs a status is derived from must recompute that
    // status fresh, right now — never edit weight/height and leave the old
    // wfa/hfa/wfl_h status sitting there stale.
    const date_measured = fields.date_measured ?? existing.date_measured;
    const weight = fields.weight ?? existing.weight;
    const height = fields.height ?? existing.height;
    const age_in_months = calculateAgeInMonths(child.dob, date_measured);
    const { wfa_status, hfa_status, wfl_h_status } = classifyNutritionStatus({
      sex: child.gender,
      ageInMonths: age_in_months,
      weightKg: Number(weight),
      heightCm: Number(height),
    });

    const assessment = await assessmentModel.update(req.params.id, {
      ...fields,
      age_in_months,
      wfa_status,
      hfa_status,
      wfl_h_status,
    });
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

module.exports = {
  listAssessments,
  getAssessment,
  createAssessment,
  previewAssessment,
  updateAssessment,
  deleteAssessment,
};
