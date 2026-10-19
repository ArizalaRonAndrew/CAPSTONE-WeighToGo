const supplementModel = require("../models/supplement.model");
const childrenModel = require("../models/children.model");
const { calculateAgeInMonths, todayInManila } = require("../utils/date");
const { getDueSupplements, getComplianceStatus, getSupplementSchedule, isUndoableRecord } = require("../services/supplementSchedule.service");
const { assertBarangayAccess } = require("../utils/access");
const { pickFields } = require("../utils/pickFields");
const { bustAll, touchRevs } = require("../config/redis");

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

    const todayStr = todayInManila();
    // One batched fetch for every visible child — a per-child query here
    // was N+1 round trips (thousands of children), which made the BNS due
    // list take so long to refresh that just-recorded doses still appeared
    // as due after the modal closed.
    const childIds = children.map((c) => c.id);
    // Chunked: a single .in() with thousands of ids would blow past URL
    // length limits on the PostgREST query.
    const allRecords = [];
    for (let i = 0; i < childIds.length; i += 500) {
      allRecords.push(...(await supplementModel.findAll({ childIds: childIds.slice(i, i + 500) })));
    }
    const recordsByChild = new Map();
    for (const r of allRecords) {
      if (!recordsByChild.has(r.child_id)) recordsByChild.set(r.child_id, []);
      recordsByChild.get(r.child_id).push(r);
    }
    const results = [];
    for (const child of children) {
      const ageInMonths = calculateAgeInMonths(child.dob, today);
      const ageAtRegistration = calculateAgeInMonths(child.dob, child.created_at);
      const records = recordsByChild.get(child.id) || [];
      const due = getDueSupplements(ageInMonths, records, ageAtRegistration, child.dob, todayStr);
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
        const compliance = getComplianceStatus(ageInMonths, supplementsByChild.get(child.id) || [], child.dob, todayInManila());
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
    const schedule = getSupplementSchedule(ageInMonths, records, child.dob, todayInManila());

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

    const effectiveDate = date_administered || todayInManila();
    const age_in_months = calculateAgeInMonths(child.dob, effectiveDate);

    // Bracket enforcement: Second Dose stays locked until its bracket's
    // First Dose is recorded; closed (grace-expired) and upcoming brackets
    // cannot be recorded at all.
    const existingRecords = await supplementModel.findAll({ childId: child_id });
    if (existingRecords.some((r) => r.supplement_type === supplement_type && r.dose_order === dose_order)) {
      return res.status(409).json({ error: "That dose has already been recorded for this child." });
    }
    const schedule = getSupplementSchedule(age_in_months, existingRecords, child.dob, effectiveDate.slice(0, 10));
    const doses = schedule[supplement_type] || [];
    const target = doses.find((d) => d.dose_order === dose_order);
    if (!target) {
      return res.status(400).json({ error: `Unknown dose_order ${dose_order} for ${supplement_type}.` });
    }
    if (target.status === "waiting") {
      const when = target.opens_on_date || `${target.opens_at_month} months`;
      return res.status(400).json({ error: `${target.requirement} opens on ${when} (6 months after the First Dose).` });
    }
    if (target.status === "locked") {
      return res.status(400).json({ error: `Record the First Dose for ${target.bracket_label} before the Second Dose.` });
    }
    if (target.status === "missed") {
      return res.status(400).json({ error: `${target.requirement} is no longer eligible — the First Dose was administered late. Wait for the next age bracket.` });
    }
    if (target.status === "upcoming") {
      return res.status(400).json({ error: `${target.requirement} is not yet due for this child.` });
    }
    if (target.status === "closed") {
      return res.status(400).json({ error: `${target.requirement} is already closed (grace period passed).` });
    }
    if (target.status !== "due" && target.status !== "overdue") {
      return res.status(400).json({ error: `${target.requirement} cannot be recorded right now.` });
    }

    const supplement = await supplementModel.create({
      child_id,
      supplement_type,
      dose_order,
      age_in_months,
      date_administered: effectiveDate,
    });
    // Due/compliance/schedule lists and the vitamin report derive from this.
    await bustAll(["supplements:*", "reports:*"]);
    await touchRevs([effectiveDate.slice(0, 7)]);
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
    // Keep the bracket invariants on edits that retarget a record: the new
    // (type, order) must be one this child could still be given today.
    if (fields.supplement_type !== undefined || fields.dose_order !== undefined) {
      const nextType = fields.supplement_type || existing.supplement_type;
      const nextOrder = fields.dose_order !== undefined ? fields.dose_order : existing.dose_order;
      if (!["Vitamin A", "Deworming"].includes(nextType)) {
        return res.status(400).json({ error: "supplement_type must be 'Vitamin A' or 'Deworming'" });
      }
      const siblings = (await supplementModel.findAll({ childId: existing.child_id })).filter(
        (r) => String(r.id) !== String(existing.id)
      );
      if (siblings.some((r) => r.supplement_type === nextType && r.dose_order === nextOrder)) {
        return res.status(409).json({ error: "That dose has already been recorded for this child." });
      }
      const ageNow = calculateAgeInMonths(child.dob, new Date());
      const target = (getSupplementSchedule(ageNow, siblings, child.dob, todayInManila())[nextType] || []).find((d) => d.dose_order === nextOrder);
      if (!target) {
        return res.status(400).json({ error: `Unknown dose_order ${nextOrder} for ${nextType}.` });
      }
      if (target.status === "waiting") {
        const when = target.opens_on_date || `${target.opens_at_month} months`;
        return res.status(400).json({ error: `${target.requirement} opens on ${when} (6 months after the First Dose).` });
      }
      if (target.status === "locked") {
        return res.status(400).json({ error: `Record the First Dose for ${target.bracket_label} before the Second Dose.` });
      }
      if (target.status === "missed") {
        return res.status(400).json({ error: `${target.requirement} is no longer eligible — the First Dose was administered late. Wait for the next age bracket.` });
      }
      if (target.status === "upcoming" || target.status === "closed") {
        return res.status(400).json({ error: `${target.requirement} cannot be recorded right now.` });
      }
    }
    const supplement = await supplementModel.update(req.params.id, fields);
    await bustAll(["supplements:*", "reports:*"]);
    await touchRevs([existing.date_administered?.slice(0, 7), supplement.date_administered?.slice(0, 7)]);
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

    // Undo is only offered within 24h of the tap — older records reject.
    if ((existing.created_at || existing.updated_at) && !isUndoableRecord(existing)) {
      return res.status(400).json({ error: "The 24-hour undo window for that dose has passed." });
    }

    // Undo guard: a bracket's First Dose can't be undone while its Second
    // Dose still stands — undo the Second Dose first so the lock invariant
    // (no Second without First) survives the undo.
    const siblings = await supplementModel.findAll({ childId: existing.child_id });
    const schedule = getSupplementSchedule(calculateAgeInMonths(child.dob, new Date()), siblings, child.dob, todayInManila());
    const undone = (schedule[existing.supplement_type] || []).find((d) => d.dose_order === existing.dose_order);
    if (undone && undone.slot !== "Second Dose") {
      const secondInBracket = (schedule[existing.supplement_type] || []).find(
        (d) => d.bracket_id === undone.bracket_id && d.slot === "Second Dose"
      );
      const secondStillGiven = siblings.some(
        (r) => r.supplement_type === existing.supplement_type && secondInBracket && r.dose_order === secondInBracket.dose_order
      );
      if (secondStillGiven) {
        return res.status(400).json({ error: `Undo the Second Dose for ${undone.bracket_label} before undoing the First Dose.` });
      }
    }

    const supplement = await supplementModel.softDelete(req.params.id);
    await bustAll(["supplements:*", "reports:*"]);
    await touchRevs([existing.date_administered?.slice(0, 7)]);
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
