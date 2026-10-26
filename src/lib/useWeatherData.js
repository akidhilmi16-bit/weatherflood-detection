import { useCallback, useEffect, useState } from 'react';
import { fetchEndpoint } from './api.js';

const initial = { data: null, fetchedAt: null, stale: false, error: null, loading: true };

export function useEndpoint(name) {
  const [state, setState] = useState(initial);

  const load = useCallback(
    async (force = false) => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetchEndpoint(name, { force });
        setState({ ...res, error: res.error ?? null, loading: false });
      } catch (err) {
        setState((s) => ({ ...s, error: err.message, loading: false }));
      }
    },
    [name],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: () => load(true) };
}
