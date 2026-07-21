import { useEffect, useState } from 'react';

const API_BASE_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

// Checks whether the public site is in maintenance mode via the backend
// config endpoint. Fails open to "not in maintenance" if the check itself
// fails, so a backend hiccup doesn't lock out the whole public site.
function useMaintenanceMode() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/config/maintenance-mode`)
      .then((res) => (res.ok ? res.json() : { maintenanceMode: false }))
      .then((data) => {
        if (!cancelled) setMaintenanceMode(!!data.maintenanceMode);
      })
      .catch(() => {
        if (!cancelled) setMaintenanceMode(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { maintenanceMode, loading };
}

export default useMaintenanceMode;
