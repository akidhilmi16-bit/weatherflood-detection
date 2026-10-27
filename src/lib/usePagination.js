import { useEffect, useState } from 'react';

/**
 * Client-side paging for a list. Goes back to page 1 whenever `resetKey`
 * changes (a new filter, search or sort), and `reveal` jumps to the page that
 * holds an item, so a selection made on the map is visible in the list.
 */
export function usePagination(items, { pageSize: initialSize = 20, resetKey } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  useEffect(() => setPage(1), [resetKey, pageSize]);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;

  return {
    page: current,
    pages,
    pageSize,
    total,
    start,
    items: items.slice(start, start + pageSize),
    setPage: (p) => setPage(Math.min(Math.max(1, p), pages)),
    setPageSize,
    reveal: (match) => {
      const i = items.findIndex(match);
      if (i >= 0) setPage(Math.floor(i / pageSize) + 1);
    },
  };
}
