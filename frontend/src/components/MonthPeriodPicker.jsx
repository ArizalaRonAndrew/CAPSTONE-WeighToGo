import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  currentMonth,
  monthLabel,
  periodKeyForMonth,
  periodOptionsForYear,
} from "../utils/month";

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="15"
      height="15"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`period-picker-chevron${open ? " period-picker-chevron-open" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="period-picker-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="15"
      height="15"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="13"
      height="13"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8.2v.1" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

// Assessment-period picker for report filters. Replaces <input type="month">,
// whose native calendar still offers January, February, and March as three
// separate choices even though this system records just one assessment for the
// whole quarter. This menu exposes a single "January – March" option and sends
// the canonical "YYYY-Q1" period key the API understands.
export default function MonthPeriodPicker({
  value,
  onChange,
  id,
  disabled = false,
  align = "left",
  className = "",
}) {
  const fallbackId = useId();
  const triggerId = id || fallbackId;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selectedValue = periodKeyForMonth(value) || periodKeyForMonth(currentMonth());
  const selectedYear = Number(selectedValue.slice(0, 4));
  const currentYear = Number(currentMonth().slice(0, 4));
  const [viewYear, setViewYear] = useState(selectedYear);

  const options = useMemo(() => periodOptionsForYear(viewYear), [viewYear]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function toggleMenu() {
    if (disabled) return;
    if (!open) setViewYear(selectedYear);
    setOpen((current) => !current);
  }

  function choose(optionValue) {
    onChange(optionValue);
    setOpen(false);
  }

  return (
    <div
      className={`period-picker${open ? " period-picker-open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        id={triggerId}
        type="button"
        className="input period-picker-trigger"
        onClick={toggleMenu}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Assessment period: ${monthLabel(selectedValue)}`}
        title={monthLabel(selectedValue)}
      >
        <span className="period-picker-trigger-icon">
          <CalendarIcon />
        </span>
        <span className="period-picker-trigger-copy">
          <span className="period-picker-trigger-value">{monthLabel(selectedValue)}</span>
          <span className="period-picker-trigger-hint">
            {selectedValue.endsWith("-Q1") ? "Quarterly assessment period" : "Monthly assessment period"}
          </span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className={`period-picker-menu${align === "right" ? " period-picker-menu-right" : ""}`}
          role="dialog"
          aria-label="Select assessment period"
        >
          <div className="period-picker-menu-head">
            <div>
              <div className="period-picker-menu-eyebrow">Assessment period</div>
              <div className="period-picker-menu-title">Select a month or quarter</div>
            </div>
            <div className="period-picker-year-nav" aria-label="Change year">
              <button
                type="button"
                className="period-picker-year-btn"
                onClick={() => setViewYear((year) => year - 1)}
                aria-label="Previous year"
              >
                <ArrowLeftIcon />
              </button>
              <span className="period-picker-year">{viewYear}</span>
              <button
                type="button"
                className="period-picker-year-btn"
                onClick={() => setViewYear((year) => Math.min(currentYear, year + 1))}
                disabled={viewYear >= currentYear}
                aria-label="Next year"
              >
                <ArrowRightIcon />
              </button>
            </div>
          </div>

          <div className="period-picker-list" role="listbox" aria-labelledby={triggerId}>
            {options.map((option) => {
              const active = option.value === selectedValue;
              const isQuarter = option.type === "quarter";
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`period-picker-option${isQuarter ? " period-picker-option-quarter" : ""}${
                    active ? " period-picker-option-active" : ""
                  }`}
                  onClick={() => choose(option.value)}
                >
                  <span className="period-picker-option-copy">
                    <span className="period-picker-option-label">
                      {isQuarter && <span className="period-picker-quarter-badge">Q1</span>}
                      {option.label}
                    </span>
                    <span className="period-picker-option-description">{option.description}</span>
                  </span>
                  {active && <CheckIcon />}
                </button>
              );
            })}
          </div>

          <p className="period-picker-note">
            <InfoIcon />
            <span>
              January–March is recorded once per child, so it is shown and reported as one
              combined Q1 period.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
