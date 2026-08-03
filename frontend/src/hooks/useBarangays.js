import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useBarangays() {
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/barangays")
      .then(setBarangays)
      .finally(() => setLoading(false));
  }, []);

  return { barangays, loading };
}
