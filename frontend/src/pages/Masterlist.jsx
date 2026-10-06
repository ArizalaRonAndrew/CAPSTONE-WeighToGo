import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRevReport } from "../hooks/useRevReport";
import RefreshLine from "../components/RefreshLine";
import { subscribeOutbox } from "../utils/outbox";
import { ageInMonths } from "../utils/age";
import { currentMonth } from "../utils/month";
import { formatNameForTable } from "../utils/name";
import RegisterChildModal from "../components/RegisterChildModal";
import ManageChildModal from "../components/ManageChildModal";
import Dropdown from "../components/Dropdown";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const PAGE_SIZE = 7;
const MOBILE_PAGE_SIZE = 10;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 701px)").matches
  );

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 701px)");
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

function SearchIcon() {
  return (
    <svg
      className="search-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function Masterlist() {
  const { user } = useAuth();
  const isDesktop = useIsDesktop();

  const [search, setSearch] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [checkupFilter, setCheckupFilter] = useState("");
  const [registerNotice, setRegisterNotice] = useState("");
  // Synthetic rows for registrations still sitting in the offline queue —
  // cleared once the queue drains and fresh data arrives.
  const [extraChildren, setExtraChildren] = useState([]);
  const [showRegister, setShowRegister] = useState(false);
  const [manageChildId, setManageChildId] = useState(null);
  const [page, setPage] = useState(1);
  const [mobilePage, setMobilePage] = useState(1);

  // Rev-gated: snapshots render instantly; the roster + checkups refetch
  // only when revision counters moved server-side.
  const monthNow = currentMonth();
  const childrenQuery = useRevReport("/children", [monthNow]);
  const assessmentsQuery = useRevReport("/assessments", [monthNow]);

  const children = useMemo(
    () => [...extraChildren, ...((childrenQuery.data || []).filter((c) => !extraChildren.some((x) => x.name === c.name && x.dob === c.dob)))],
    [extraChildren, childrenQuery.data]
  );
  const checkedChildIds = useMemo(() => {
    const rows = assessmentsQuery.data || [];
    return new Set(rows.filter((a) => a.date_measured?.slice(0, 7) === monthNow).map((a) => a.child_id));
  }, [assessmentsQuery.data, monthNow]);
  const loading = childrenQuery.loading && assessmentsQuery.loading;
  const error =
    (!childrenQuery.data && childrenQuery.error) || (!assessmentsQuery.data && assessmentsQuery.error) || "";
  const refreshing = childrenQuery.refreshing || assessmentsQuery.refreshing;
  const updatedAt = Math.max(childrenQuery.updatedAt || 0, assessmentsQuery.updatedAt || 0) || null;

  function refreshAll() {
    childrenQuery.refresh();
    assessmentsQuery.refresh();
  }

  // When the offline queue drains, synced rows arrive via refresh — drop the
  // synthetic placeholders so they don't duplicate the real records.
  const hadPending = useRef(false);
  useEffect(() => {
    return subscribeOutbox((s) => {
      if (s.pending > 0) hadPending.current = true;
      if (hadPending.current && s.pending === 0) {
        hadPending.current = false;
        setExtraChildren([]);
        refreshAll();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, purokFilter, checkupFilter]);

  useEffect(() => {
    setMobilePage(1);
  }, [search, purokFilter, checkupFilter]);

  const purokOptions = [...new Set(children.map((c) => c.purok).filter(Boolean))].sort();

  const filteredChildren = children.filter((child) => {
    if (search && !child.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (purokFilter && child.purok !== purokFilter) return false;
    if (checkupFilter) {
      const isChecked = checkedChildIds.has(child.id);
      if (checkupFilter === "checked" && !isChecked) return false;
      if (checkupFilter === "pending" && isChecked) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredChildren.length / PAGE_SIZE));
  const mobileTotalPages = Math.max(1, Math.ceil(filteredChildren.length / MOBILE_PAGE_SIZE));
  const pageChildren = isDesktop
    ? filteredChildren.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredChildren.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE);

  const checkedCount = children.filter((c) => checkedChildIds.has(c.id)).length;
  const hasActiveFilters = Boolean(search || purokFilter || checkupFilter);

  function clearFilters() {
    setSearch("");
    setPurokFilter("");
    setCheckupFilter("");
  }

  return (
    <div>
      <div className="page-header">
        <h1>{user.assigned_barangay} Masterlist</h1>
        <button className="btn" onClick={() => setShowRegister(true)}>
          + Register Child
        </button>
      </div>

      <div className="stat-row">
        <div className="card stat-tile">
          <div className="value">{children.length}</div>
          <div className="label">Registered children</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{checkedCount}</div>
          <div className="label">Checked this month</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{children.length - checkedCount}</div>
          <div className="label">Pending this month</div>
        </div>
      </div>

      {error && (
        <div className="banner banner-warning" style={{ marginBottom: 20 }}>
          {error}{" "}
          <button type="button" className="btn btn-sm" onClick={refreshAll}>
            Retry
          </button>
        </div>
      )}
      {registerNotice && (
        <div className="banner banner-success" style={{ marginBottom: 20 }}>
          {registerNotice}
        </div>
      )}
      {!loading && (
        <RefreshLine refreshing={refreshing} updatedAt={updatedAt} onRefresh={refreshAll} />
      )}

      <div className="card filter-card">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div className="field search-field">
            <label>Search</label>
            <div className="search-input-wrap">
              <SearchIcon />
              <input
                className="input"
                type="text"
                placeholder="Search child's name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Purok / Sitio</label>
            <Dropdown
              value={purokFilter}
              options={[{ value: "", label: "All puroks" }, ...purokOptions.map((purok) => ({ value: purok, label: purok }))]}
              onChange={setPurokFilter}
            />
          </div>
          <div className="field">
            <label>Checkup Status</label>
            <Dropdown
              value={checkupFilter}
              options={[
                { value: "", label: "All statuses" },
                { value: "checked", label: "Checked" },
                { value: "pending", label: "Pending" },
              ]}
              onChange={setCheckupFilter}
            />
          </div>
          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <p className="results-count">
          Showing {filteredChildren.length} of {children.length} children
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name of Child</th>
              <th className="hide-on-mobile">Parent / Guardian</th>
              <th className="hide-on-mobile">Gender</th>
              <th>Age (mos)</th>
              <th>Purok / Sitio</th>
              <th>Checkup Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="loading-state">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && !error && children.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No children registered yet.
                </td>
              </tr>
            )}
            {!loading && children.length > 0 && filteredChildren.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  <div>No children match your filters.</div>
                  <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
            {pageChildren.map((child) => {
              const isChecked = checkedChildIds.has(child.id);
              return (
                <tr
                  key={child.id}
                  className="clickable"
                  onClick={() => setManageChildId(child.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setManageChildId(child.id); } }}
                >
                  <td data-label="Name of Child">
                    <div className="child-name-cell">
                      <span className="avatar-circle">{initials(child.name)}</span>
                      <span style={{ fontWeight: 700 }}>{formatNameForTable(child.name)}</span>
                    </div>
                  </td>
                  <td data-label="Parent / Guardian" className="hide-on-mobile">{formatNameForTable(child.parent_name)}</td>
                  <td data-label="Gender" className="hide-on-mobile">{child.gender}</td>
                  <td data-label="Age (mos)">{ageInMonths(child.dob)}</td>
                  <td data-label="Purok / Sitio">{child.purok}</td>
                  <td data-label="Checkup Status">
                    <span className={`status-pill ${isChecked ? "status-pill-checked" : "status-pill-pending"}`}>
                      {isChecked ? "✓ Checked" : "Pending"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isDesktop && filteredChildren.length > 0 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            {`Showing ${(mobilePage - 1) * MOBILE_PAGE_SIZE + 1}–${Math.min(mobilePage * MOBILE_PAGE_SIZE, filteredChildren.length)} of ${filteredChildren.length}`}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={mobilePage <= 1}
              onClick={() => { setMobilePage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            >
              Previous
            </button>
            <span className="pagination-page">
              Page {mobilePage} of {mobileTotalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={mobilePage >= mobileTotalPages}
              onClick={() => { setMobilePage((p) => Math.min(mobileTotalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {isDesktop && (
        <div className="pagination-bar">
          <span className="pagination-info">
            {filteredChildren.length === 0
              ? "No records"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredChildren.length)} of ${filteredChildren.length}`}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showRegister && (
        <RegisterChildModal
          onClose={() => setShowRegister(false)}
          onRegistered={(child) => {
            setShowRegister(false);
            if (child?._queued) {
              // Offline: show the synthetic row now; the queue swaps in the
              // real record on sync and the next load reconciles the list.
              setExtraChildren((prev) => [child, ...prev]);
              setRegisterNotice("Registration saved on this device — will sync when you're back online.");
            } else {
              setRegisterNotice("");
              refreshAll();
            }
          }}
        />
      )}

      {manageChildId && (
        <ManageChildModal
          childId={manageChildId}
          onClose={() => setManageChildId(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}
