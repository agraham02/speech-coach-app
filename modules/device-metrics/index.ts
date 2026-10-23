import { requireOptionalNativeModule } from "expo-modules-core";

// JS side of the DeviceMetrics module (ios/DeviceMetricsModule.swift,
// android/.../DeviceMetricsModule.kt). Builds made before the module was
// added have no native side, so every call returns null instead of throwing.

// One reading. Fields a platform cannot provide are left out.
export interface NativeSnapshot {
  platform: "ios" | "android";
  uptimeMs: number;
  // The process's cumulative CPU time (user + system), all threads.
  cpuTimeMs: number;
  cpuCores: number;
  // iOS: phys_footprint (Xcode's gauge, what jetsam counts). Android: total PSS.
  appMemoryBytes?: number;
  appResidentBytes?: number;
  // iOS: ledger peak footprint. Android: VmHWM (peak resident).
  appLifetimePeakBytes?: number;
  // iOS only: how much more the app may allocate before it is killed.
  appHeadroomBytes?: number;
  // Android only.
  nativeHeapBytes?: number;
  javaHeapBytes?: number;
  deviceTotalBytes?: number;
  // Android: availMem. iOS: free + inactive pages, a rough figure.
  deviceAvailableBytes?: number;
  deviceLowMemory?: boolean;
  deviceLowMemoryThresholdBytes?: number;
  // iOS: nominal | fair | serious | critical.
  // Android (API 29+): none | light | moderate | severe | critical | emergency | shutdown.
  thermalState: string;
  // Android 11+: 1.0 is where the system starts throttling hard.
  thermalHeadroom?: number;
  // 0..1.
  batteryLevel?: number;
  batteryState?: "charging" | "full" | "unplugged" | "unknown";
  // Android only, instantaneous; the sign convention varies by maker.
  batteryCurrentMicroAmps?: number;
  lowPowerMode: boolean;
}

// What a watch saw between begin and end (or the read).
export interface NativeWatchSummary {
  durationMs: number;
  samples: number;
  cpuTimeMs: number;
  // 100 = one full core.
  avgCpuPercent: number;
  peakCpuPercent: number;
  startMemoryBytes: number;
  endMemoryBytes: number;
  peakMemoryBytes: number;
  avgMemoryBytes: number;
  worstThermalState: string;
  startBatteryLevel?: number;
  endBatteryLevel?: number;
  // Android only.
  avgCurrentMicroAmps?: number;
}

interface DeviceMetricsNative {
  snapshot(): NativeSnapshot;
  beginWatch(id: string, intervalMs: number): boolean;
  readWatch(id: string): NativeWatchSummary | null;
  endWatch(id: string): NativeWatchSummary | null;
}

let cached: DeviceMetricsNative | null | undefined;

function native(): DeviceMetricsNative | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireOptionalNativeModule<DeviceMetricsNative>("DeviceMetrics");
  } catch {
    cached = null;
  }
  return cached;
}

export function hasDeviceMetrics(): boolean {
  return native() != null;
}

export function readNativeSnapshot(): NativeSnapshot | null {
  const module = native();
  if (!module) return null;
  try {
    return module.snapshot();
  } catch {
    return null;
  }
}

export function beginNativeWatch(id: string, intervalMs: number): boolean {
  const module = native();
  if (!module) return false;
  try {
    return module.beginWatch(id, Math.round(intervalMs));
  } catch {
    return false;
  }
}

export function readNativeWatch(id: string): NativeWatchSummary | null {
  const module = native();
  if (!module) return null;
  try {
    return module.readWatch(id) ?? null;
  } catch {
    return null;
  }
}

export function endNativeWatch(id: string): NativeWatchSummary | null {
  const module = native();
  if (!module) return null;
  try {
    return module.endWatch(id) ?? null;
  } catch {
    return null;
  }
}
