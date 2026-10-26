import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Masterlist from "./pages/Masterlist";
import VitaminsDeworming from "./pages/VitaminsDeworming";
import Reports from "./pages/Reports";
import MonthlyReport from "./pages/MonthlyReport";
import HealthTrends from "./pages/admin/HealthTrends";
import BarangayMap from "./pages/admin/BarangayMap";
import AdminMasterlist from "./pages/admin/AdminMasterlist";
import { resumePathFor, saveLastRoute } from "./utils/lastRoute";

// Records the current page so a PWA relaunch can resume it (see HomeRedirect).
function LastRouteTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    saveLastRoute(pathname);
  }, [pathname]);
  return null;
}

// "/" is also the PWA start_url, so relaunching the installed app lands here.
// Send a signed-in user back to their last page (when it belongs to their
// role), falling back to their landing page — never straight to /login.
function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-state">Loading...</div>;
  return <Navigate to={user ? resumePathFor(user) : "/login"} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LastRouteTracker />
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route element={<ProtectedRoute allowedRoles={["BNS"]} />}>
                <Route path="/bns/masterlist" element={<Masterlist />} />
                <Route path="/bns/vitamins" element={<VitaminsDeworming />} />
                <Route path="/bns/monthly-report" element={<MonthlyReport />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={["MNAO"]} />}>
                <Route path="/admin/trends" element={<HealthTrends />} />
                <Route path="/admin/masterlist" element={<AdminMasterlist />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/map" element={<BarangayMap />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
