package expo.modules.devicemetrics

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Process and device numbers for the Dev tab's Metrics screen:
// - memory: total PSS (what Android Studio's profiler and the system's memory
//   accounting use), resident size and its high-water mark from
//   /proc/self/status, and the native heap (where model weights land)
// - CPU: the process's cumulative CPU time; JS turns deltas into a
//   percentage, where 100% is one full core. Whole-device CPU has been closed
//   to apps since Android 8.
// - device RAM (ActivityManager), thermal status (API 29+) and headroom
//   (API 30+), battery level, charging, current draw and battery saver
//
// A "watch" samples on its own thread at a fixed interval and keeps the
// peaks, so a short spike is caught even while the JS thread is busy.
class DeviceMetricsModule : Module() {
  private val lock = Any()
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var intervalMs = 0L
  private val watches = HashMap<String, Watch>()

  private var headroomAt = 0L
  private var headroom: Float? = null

  private val context: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("DeviceMetrics")

    OnDestroy {
      synchronized(lock) {
        watches.clear()
        stopThread()
      }
    }

    Function("snapshot") {
      snapshot()
    }

    Function("beginWatch") { id: String, requestedMs: Int ->
      synchronized(lock) {
        watches[id] = Watch(sample())
        ensureThread(maxOf(100L, requestedMs.toLong()))
      }
      true
    }

    Function("readWatch") { id: String ->
      synchronized(lock) {
        val watch = watches[id] ?: return@Function null
        watch.add(sample())
        watch.summary()
      }
    }

    Function("endWatch") { id: String ->
      synchronized(lock) {
        val watch = watches.remove(id) ?: return@Function null
        watch.add(sample())
        if (watches.isEmpty()) stopThread()
        watch.summary()
      }
    }
  }

  // Under `lock`. The fastest interval any caller asked for wins.
  private fun ensureThread(requestedMs: Long) {
    if (handler != null && intervalMs <= requestedMs) return
    intervalMs = requestedMs
    if (handler == null) {
      val started = HandlerThread("tono-device-metrics", Process.THREAD_PRIORITY_BACKGROUND).apply { start() }
      thread = started
      handler = Handler(started.looper)
    }
    val h = handler ?: return
    h.removeCallbacksAndMessages(null)
    h.postDelayed(object : Runnable {
      override fun run() {
        synchronized(lock) {
          if (watches.isEmpty()) return
          val s = sample()
          watches.values.forEach { it.add(s) }
        }
        h.postDelayed(this, intervalMs)
      }
    }, intervalMs)
  }

  private fun stopThread() {
    handler?.removeCallbacksAndMessages(null)
    thread?.quitSafely()
    handler = null
    thread = null
    intervalMs = 0L
  }

  private fun sample(): Sample {
    val battery = batteryManager()
    return Sample(
      uptimeMs = SystemClock.elapsedRealtime(),
      cpuMs = Process.getElapsedCpuTime().toDouble(),
      memory = Debug.getPss() * 1024L,
      thermal = thermalStatus() ?: 0,
      batteryLevel = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }?.let { it / 100.0 },
      currentMicroAmps = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)?.takeIf { it != Int.MIN_VALUE && it != 0 }?.toDouble(),
    )
  }

  private fun snapshot(): Map<String, Any?> {
    val status = readProcStatus()
    val activity = context?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val memInfo = ActivityManager.MemoryInfo().also { activity?.getMemoryInfo(it) }
    val battery = batteryManager()
    val power = context?.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val runtime = Runtime.getRuntime()
    val out = HashMap<String, Any?>()
    out["platform"] = "android"
    out["uptimeMs"] = SystemClock.elapsedRealtime().toDouble()
    out["cpuTimeMs"] = Process.getElapsedCpuTime().toDouble()
    out["cpuCores"] = runtime.availableProcessors()
    out["appMemoryBytes"] = (Debug.getPss() * 1024L).toDouble()
    status["VmRSS"]?.let { out["appResidentBytes"] = it.toDouble() }
    status["VmHWM"]?.let { out["appLifetimePeakBytes"] = it.toDouble() }
    out["nativeHeapBytes"] = Debug.getNativeHeapAllocatedSize().toDouble()
    out["javaHeapBytes"] = (runtime.totalMemory() - runtime.freeMemory()).toDouble()
    if (activity != null) {
      out["deviceTotalBytes"] = memInfo.totalMem.toDouble()
      out["deviceAvailableBytes"] = memInfo.availMem.toDouble()
      out["deviceLowMemory"] = memInfo.lowMemory
      out["deviceLowMemoryThresholdBytes"] = memInfo.threshold.toDouble()
    }
    out["thermalState"] = thermalStatus()?.let { thermalName(it) } ?: "unknown"
    thermalHeadroom()?.let { out["thermalHeadroom"] = it.toDouble() }
    if (battery != null) {
      battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }?.let { out["batteryLevel"] = it / 100.0 }
      out["batteryState"] = if (battery.isCharging) "charging" else "unplugged"
      battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        .takeIf { it != Int.MIN_VALUE && it != 0 }
        ?.let { out["batteryCurrentMicroAmps"] = it.toDouble() }
    }
    out["lowPowerMode"] = power?.isPowerSaveMode ?: false
    return out
  }

  private fun batteryManager(): BatteryManager? =
    context?.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager

  private fun thermalStatus(): Int? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    val power = context?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return null
    return power.currentThermalStatus
  }

  // getThermalHeadroom returns NaN when called much faster than once a
  // second, so it is cached for a second.
  private fun thermalHeadroom(): Float? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    val now = SystemClock.elapsedRealtime()
    if (now - headroomAt < 1000L) return headroom
    val power = context?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return null
    val value = power.getThermalHeadroom(0)
    headroomAt = now
    headroom = if (value.isNaN()) headroom else value
    return headroom
  }

  // VmRSS and VmHWM in bytes (the file reports kB).
  private fun readProcStatus(): Map<String, Long> {
    val out = HashMap<String, Long>()
    try {
      File("/proc/self/status").forEachLine { line ->
        if (line.startsWith("VmRSS:") || line.startsWith("VmHWM:")) {
          val kb = line.substringAfter(':').trim().substringBefore(' ').toLongOrNull()
          if (kb != null) out[line.substringBefore(':')] = kb * 1024L
        }
      }
    } catch (_: Exception) {
      // Unreadable on some ROMs; the values are simply missing then.
    }
    return out
  }

  companion object {
    fun thermalName(status: Int): String = when (status) {
      0 -> "none"
      1 -> "light"
      2 -> "moderate"
      3 -> "severe"
      4 -> "critical"
      5 -> "emergency"
      6 -> "shutdown"
      else -> "unknown"
    }
  }
}

data class Sample(
  val uptimeMs: Long,
  val cpuMs: Double,
  val memory: Long,
  val thermal: Int,
  val batteryLevel: Double?,
  val currentMicroAmps: Double?,
)

// Peaks and averages for one watch. Only touched under the module's lock.
class Watch(private val start: Sample) {
  private var last = start
  private var peakMemory = start.memory
  private var memorySum = start.memory.toDouble()
  private var peakCpuPercent = 0.0
  private var worstThermal = start.thermal
  private var samples = 1
  private var currentSum = 0.0
  private var currentSamples = 0

  init {
    start.currentMicroAmps?.let { currentSum += it; currentSamples++ }
  }

  fun add(sample: Sample) {
    val wallMs = (sample.uptimeMs - last.uptimeMs).toDouble()
    if (wallMs >= 50) {
      peakCpuPercent = maxOf(peakCpuPercent, (sample.cpuMs - last.cpuMs) / wallMs * 100)
    }
    peakMemory = maxOf(peakMemory, sample.memory)
    memorySum += sample.memory.toDouble()
    worstThermal = maxOf(worstThermal, sample.thermal)
    sample.currentMicroAmps?.let { currentSum += it; currentSamples++ }
    samples++
    last = sample
  }

  fun summary(): Map<String, Any?> {
    val durationMs = (last.uptimeMs - start.uptimeMs).toDouble()
    val cpuMs = last.cpuMs - start.cpuMs
    val out = HashMap<String, Any?>()
    out["durationMs"] = durationMs
    out["samples"] = samples
    out["cpuTimeMs"] = cpuMs
    out["avgCpuPercent"] = if (durationMs > 0) cpuMs / durationMs * 100 else 0.0
    out["peakCpuPercent"] = peakCpuPercent
    out["startMemoryBytes"] = start.memory.toDouble()
    out["endMemoryBytes"] = last.memory.toDouble()
    out["peakMemoryBytes"] = peakMemory.toDouble()
    out["avgMemoryBytes"] = memorySum / samples
    out["worstThermalState"] = DeviceMetricsModule.thermalName(worstThermal)
    start.batteryLevel?.let { out["startBatteryLevel"] = it }
    last.batteryLevel?.let { out["endBatteryLevel"] = it }
    if (currentSamples > 0) out["avgCurrentMicroAmps"] = currentSum / currentSamples
    return out
  }
}
