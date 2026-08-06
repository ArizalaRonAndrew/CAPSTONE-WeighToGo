const supplementModel = require("../models/supplement.model");
const childrenModel = require("../models/children.model");
const { calculateAgeInMonths } = require("../utils/date");
const { getDueSupplements, getComplianceStatus, getSupplementSchedule } = require("../services/supplementSchedule.service");
const { assertBarangayAccess } = require("../utils/access");
const { pickFields } = require("../utils/pickFields");

// child_id is deliberately excluded — same reasoning as assessments: it must
// never be reassignable through an update, since that bypasses the
// barangay-access check (which only validates the record's *current* child).
const SUPPLEMENT_UPDATE_FIELDS = ["supplement_type", "dose_order", "date_administered"];

async function visibleChildren(req) {
  if (req.user.role === "BNS") {
    return childrenModel.findAll({ barangay: req.user.assigned_barangay });
  }
  return childrenModel.findAll({ barangay: req.query.barangay || undefined });
}

async function listSupplements(req, res, next) {
  try {
    const { childId, status } = req.query;

    if (childId) {
      const child = await childrenModel.findById(childId);
      assertBarangayAccess(req, child);
      const supplements = await supplementModel.findAll({ childId, status });
      return res.json(supplements);
    }

    const children = await visibleChildren(req);
    const childIds = children.map((c) => c.id);
    const supplements = childIds.length ? await supplementModel.findAll({ childIds, status }) : [];
    res.json(supplements);
  } catch (err) {
    next(err);
  }
}

async function listDueSupplements(req, res, next) {
  try {
    const children = await visibleChildren(req);
    const today = new Date();

    const results = [];
    for (const child of children) {
      const ageInMonths = calculateAgeInMonths(child.dob, today);
      const ageAtRegistration = calculateAgeInMonths(child.dob, child.created_at);
      const records = await supplementModel.findAll({ childId: child.id });
      const due = getDueSupplements(ageInMonths, records, ageAtRegistration);
      if (due.length) {
        results.push({ child, ageInMonths, due });
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
}

async function listComplianceMasterlist(req, res, next) {
  try {
    const children = await visibleChildren(req);
    const childIds = children.map((c) => c.id);
    const supplements = childIds.length ? await supplementModel.findAll({ childIds }) : [];

    const supplementsByChild = new Map();
    for (const s of supplements) {
      if (!supplementsByChild.has(s.child_id)) supplementsByChild.set(s.child_id, []);
      supplementsByChild.get(s.child_id).push(s);
    }

    const rows = children
      .map((child) => {
        const ageInMonths = calculateAgeInMonths(child.dob);
        const compliance = getComplianceStatus(ageInMonths, supplementsByChild.get(child.id) || []);
        return {
          child_id: child.id,
          name: child.name,
          purok: child.purok,
          barangay: child.barangay,
          age_in_months: ageInMonths,
          vitaminA: compliance["Vitamin A"],
          deworming: compliance["Deworming"],
        };
      })
      .sort((a, b) => a.purok?.localeCompare(b.purok) || a.name.localeCompare(b.name));

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getChildSupplementSchedule(req, res, next) {
  try {
    const { childId } = req.query;
    if (!childId) {
      return res.status(400).json({ error: "childId is required" });
    }

    const child = await childrenModel.findById(childId);
    assertBarangayAccess(req, child);

    const ageInMonths = calculateAgeInMonths(child.dob, new Date());
    const records = await supplementModel.findAll({ childId });
    const schedule = getSupplementSchedule(ageInMonths, records);

    res.json({ child, ageInMonths, schedule });
  } catch (err) {
    next(err);
  }
}

async function getSupplement(req, res, next) {
  try {
    const supplement = await supplementModel.findById(req.params.id);
    const child = await childrenModel.findById(supplement.child_id);
    assertBarangayAccess(req, child);
    res.json(supplement);
  } catch (err) {
    next(err);
  }
}

async function createSupplement(req, res, next) {
  try {
    const { child_id, supplement_type, dose_order, date_administered } = req.body;
    if (!child_id || !supplement_type || dose_order == null) {
      return res.status(400).json({
        error: "child_id, supplement_type, and dose_order are required",
      });
    }
    if (!["Vitamin A", "Deworming"].includes(supplement_type)) {
      return res.status(400).json({ error: "supplement_type must be 'Vitamin A' or 'Deworming'" });
    }

    const child = await childrenModel.findById(child_id);
    assertBarangayAccess(req, child);

    const effectiveDate = date_administered || new Date().toISOString().slice(0, 10);
    const age_in_months = calculateAgeInMonths(child.dob, effectiveDate);

    const supplement = await supplementModel.create({
      child_id,
      supplement_type,
      dose_order,
      age_in_months,
      date_administered: effectiveDate,
    });
    res.status(201).json(supplement);
  } catch (err) {
    next(err);
  }
}

async function updateSupplement(req, res, next) {
  try {
    const existing = await supplementModel.findById(req.params.id);
    const child = await childrenModel.findById(existing.child_id);
    assertBarangayAccess(req, child);

    const fields = pickFields(req.body, SUPPLEMENT_UPDATE_FIELDS);
    const supplement = await supplementModel.update(req.params.id, fields);
    res.json(supplement);
  } catch (err) {
    next(err);
  }
}

async function deleteSupplement(req, res, next) {
  try {
    const existing = await supplementModel.findById(req.params.id);
    const child = await childrenModel.findById(existing.child_id);
    assertBarangayAccess(req, child);

    const supplement = await supplementModel.softDelete(req.params.id);
    res.json(supplement);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSupplements,
  listDueSupplements,
  listComplianceMasterlist,
  getChildSupplementSchedule,
  getSupplement,
  createSupplement,
  updateSupplement,
  deleteSupplement,
};
