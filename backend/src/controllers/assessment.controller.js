const assessmentModel = require("../models/assessment.model");
const childrenModel = require("../models/children.model");
const { calculateAgeInMonths } = require("../utils/date");
const { classifyNutritionStatus } = require("../services/nutritionStatus.service");
const { assertBarangayAccess } = require("../utils/access");

async function listAssessments(req, res, next) {
  try {
    const { childId, status } = req.query;

    if (childId) {
      const child = await childrenModel.findById(childId);
      assertBarangayAccess(req, child);
      const assessments = await assessmentModel.findAll({ childId, status });
      return res.json(assessments);
    }

    if (req.user.role === "BNS") {
      const children = await childrenModel.findAll({ barangay: req.user.assigned_barangay });
      const childIds = children.map((c) => c.id);
      const assessments = childIds.length ? await assessmentModel.findAll({ childIds, status }) : [];
      return res.json(assessments);
    }

    const assessments = await assessmentModel.findAll({ status });
    res.json(assessments);
  } catch (err) {
    next(err);
  }
}

async function getAssessment(req, res, next) {
  try {
    const assessment = await assessmentModel.findById(req.params.id);
    const child = await childrenModel.findById(assessment.child_id);
    assertBarangayAccess(req, child);
    res.json(assessment);
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
