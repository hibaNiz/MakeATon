import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// Load data from the API and reload when "deps" change.
// const { data, loading, error, reload } = useApi('/plans');
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    return api(path)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, setData, loading, error, reload: load };
}

// Value that only updates after the user stops typing (for search boxes)
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
