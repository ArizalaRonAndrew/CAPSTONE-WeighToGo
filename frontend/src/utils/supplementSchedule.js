// Client-side mirror of backend/src/services/supplementSchedule.service.js
// (DOH Garantisadong Pambata windows). Kept in lockstep by construction —
// the constants below must change together with that file. Used to render a
// child's dose schedule offline from cached supplement records; online the
// server remains the source of truth.

function buildSixMonthWindows(startMonth, endMonth, firstDoseOrder = 1) {
  const windows = [];
  let doseOrder = firstDoseOrder;
  for (let start = startMonth; start < endMonth; start += 6) {
    windows.push({ dose_order: doseOrder, start_month: start, end_month: Math.min(start + 5, endMonth) });
    doseOrder += 1;
  }
  return windows;
}

export function getScheduleWindows(supplementType) {
  if (supplementType === "Vitamin A") {
    return [{ dose_order: 1, start_month: 6, end_month: 11 }, ...buildSixMonthWindows(12, 59, 2)];
  }
  if (supplementType === "Deworming") {
    return buildSixMonthWindows(12, 59, 1);
  }
  throw new Error(`Unknown supplement type: ${supplementType}`);
}

// Same merge rule as the server: recorded dose → given; otherwise by age
// window. `records` are tbl_supplements-shaped rows ({supplement_type,
// dose_order, date_administered}); queued (unsynced) entries may be passed
// with `_queued: true` and no date — they render as given with no date line.
// (Deliberate extra vs the server: a `_queued` boolean on every dose so the
// UI can caption provisional states. Strip it before deep-comparing.)
export function getSupplementSchedule(ageInMonths, existingRecords = []) {
  const schedule = {};

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const windows = getScheduleWindows(supplementType);
    const recordsByDose = new Map(
      existingRecords
        .filter((r) => r.supplement_type === supplementType)
        .map((r) => [r.dose_order, r])
    );

    schedule[supplementType] = windows.map((window) => {
      const record = recordsByDose.get(window.dose_order);
      let status;
      if (record) {
        status = "given";
      } else if (ageInMonths < window.start_month) {
        status = "upcoming";
      } else if (ageInMonths > window.end_month) {
        status = "overdue";
      } else {
        status = "due";
      }

      return {
        supplement_type: supplementType,
        dose_order: window.dose_order,
        window_start_month: window.start_month,
        window_end_month: window.end_month,
        status,
        date_administered: record ? record.date_administered || null : null,
        record_id: record ? record.id || null : null,
        _queued: Boolean(record && record._queued),
      };
    });
  }

  return schedule;
}
