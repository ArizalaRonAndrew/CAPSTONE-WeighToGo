import { useEffect, useRef, useState } from "react";

function ChevronIcon() {
  return (
    <svg
      className="dropdown-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// A native <select>'s option list is positioned by the browser, which flips
// it above the field whenever there isn't room below in the visible window —
// there's no CSS to stop that. This renders the menu ourselves, always
// anchored below the trigger (scrolling internally past a max-height instead
// of flipping), for places where that flip is disruptive.
//
// `options` is the full list to render, in order — including an "All X"
// entry (value: "") if the field needs one; this component doesn't inject
// one itself, since some filters (e.g. an indicator picker with no "all"
// state) shouldn't have it.
export default function Dropdown({ value, onChange, options, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  function selectOption(optionValue) {
    onChange(optionValue);
    setOpen(false);
  }

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className="input dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="dropdown-trigger-label">{selectedLabel}</span>
        <ChevronIcon />
      </button>
      {open && (
        <ul className="dropdown-menu" role="listbox">
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={value === o.value}
              className={`dropdown-option ${value === o.value ? "dropdown-option-active" : ""}`}
              onClick={() => selectOption(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
