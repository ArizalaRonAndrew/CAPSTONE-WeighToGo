import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useBarangays() {
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/barangays")
      .then(setBarangays)
      .catch((err) => setError(err.message || "Failed to load barangays"))
      .finally(() => setLoading(false));
  }, []);

  return { barangays, loading, error };
}
