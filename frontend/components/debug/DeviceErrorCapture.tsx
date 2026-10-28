'use client';

import '@/lib/deviceErrorMonitor';
import { installNetworkRequestMonitor } from '@/lib/networkRequestMonitor';

// Capture request metadata in the same device-local diagnostic layer.
if (typeof window !== 'undefined') installNetworkRequestMonitor();

/** Loads the device-local error collector in the browser bundle before hydration. */
export function DeviceErrorCapture() { return null; }
