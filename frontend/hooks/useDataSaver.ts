'use client';

// The implementation lives in lib/useDataSaver.ts (one subscription for the
// whole app). This path is kept so DataSaverToggle and its tests keep working.
export { useDataSaverControls as useDataSaver } from '@/lib/useDataSaver';
