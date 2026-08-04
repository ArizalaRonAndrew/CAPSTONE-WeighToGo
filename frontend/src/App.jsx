import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Masterlist from "./pages/Masterlist";
import ChildProfile from "./pages/ChildProfile";
import VitaminsDeworming from "./pages/VitaminsDeworming";
import Reports from "./pages/Reports";
import MonthlyReport from "./pages/MonthlyReport";
import HealthTrends from "./pages/admin/HealthTrends";
import BarangayMap from "./pages/admin/BarangayMap";
import AdminMasterlist from "./pages/admin/AdminMasterlist";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/children/:id" element={<ChildProfile />} />

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

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
