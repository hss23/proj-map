'use client';

import dynamic from 'next/dynamic';
import { AppSkeleton } from '@/components/AppSkeleton';

// The cockpit is fully client-side: Leaflet needs `window`, and per-agent state lives in localStorage.
const Cockpit = dynamic(() => import('@/components/Cockpit'), { ssr: false, loading: () => <AppSkeleton /> });

export default function Page() {
  return <Cockpit />;
}
