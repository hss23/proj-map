'use client';

import { FilterPopovers, KeywordInput } from './panel/FilterBar';

/** Desktop search row (as in the reference design): keyword pill + filter pills. */
export function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-3" role="search" aria-label="Search and filters">
      <KeywordInput className="w-full max-w-[400px] flex-1 basis-64" />
      <FilterPopovers />
    </div>
  );
}
