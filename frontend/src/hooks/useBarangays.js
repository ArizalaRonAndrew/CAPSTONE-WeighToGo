import { useRevReport } from "./useRevReport";

export function useBarangays() {
  const query = useRevReport("/barangays", [], { alwaysRevalidate: true });

  return {
    barangays: Array.isArray(query.data) ? query.data : [],
    loading: query.loading,
    error: query.error,
  };
}
