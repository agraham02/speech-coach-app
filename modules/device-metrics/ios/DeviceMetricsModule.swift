import ExpoModulesCore
import Darwin
import UIKit
import os

// Process and device numbers for the Dev tab's Metrics screen, cheap enough
// to read several times a second:
// - memory: phys_footprint (what Xcode's memory gauge and the jetsam limit
//   count), resident size, and os_proc_available_memory (how much more this
//   app may allocate before iOS kills it)
// - CPU: the process's cumulative user + system time (getrusage); JS turns
//   deltas into a percentage, where 100% is one full core
// - thermal state, battery level and state, Low Power Mode
//
// A "watch" samples on a background queue at a fixed interval and keeps the
// peaks, so a short spike is caught even while the JS thread is busy.
public class DeviceMetricsModule: Module {
  private let queue = DispatchQueue(label: "tono.device-metrics", qos: .utility)
  private var timer: DispatchSourceTimer?
  private var timerIntervalMs: Int = 0
  private var watches: [String: Watch] = [:]

  private let batteryLock = NSLock()
  private var batteryLevel: Float = -1
  private var batteryState: UIDevice.BatteryState = .unknown
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("DeviceMetrics")

    OnCreate {
      // UIDevice belongs to the main thread: enable monitoring there and keep
      // a copy the sampler can read from any thread.
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        UIDevice.current.isBatteryMonitoringEnabled = true
        self.refreshBattery()
        let center = NotificationCenter.default
        for name in [UIDevice.batteryLevelDidChangeNotification, UIDevice.batteryStateDidChangeNotification] {
          self.observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
            self?.refreshBattery()
          })
        }
      }
    }

    OnDestroy {
      let observers = self.observers
      DispatchQueue.main.async {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
      }
      self.queue.sync {
        self.timer?.cancel()
        self.timer = nil
        self.watches.removeAll()
      }
    }

    // One reading of everything.
    Function("snapshot") { () -> [String: Any] in
      return self.snapshot()
    }

    // Starts tracking peaks under an id. Several watches can overlap (a
    // pipeline run and each of its steps); they share one sampler.
    Function("beginWatch") { (id: String, intervalMs: Int) -> Bool in
      self.queue.sync {
        let sample = self.sample()
        self.watches[id] = Watch(start: sample)
        self.ensureTimer(intervalMs: max(100, intervalMs))
      }
      return true
    }

    // The watch so far, without stopping it. Nil for an unknown id.
    Function("readWatch") { (id: String) -> [String: Any]? in
      return self.queue.sync { () -> [String: Any]? in
        guard let watch = self.watches[id] else { return nil }
        watch.add(self.sample())
        return watch.summary()
      }
    }

    // Stops the watch and returns its summary. Nil for an unknown id.
    Function("endWatch") { (id: String) -> [String: Any]? in
      return self.queue.sync { () -> [String: Any]? in
        guard let watch = self.watches.removeValue(forKey: id) else { return nil }
        watch.add(self.sample())
        if self.watches.isEmpty {
          self.timer?.cancel()
          self.timer = nil
          self.timerIntervalMs = 0
        }
        return watch.summary()
      }
    }
  }

  // MARK: - Sampling

  // Runs on `queue`. The fastest interval any caller asked for wins.
  private func ensureTimer(intervalMs: Int) {
    if timer != nil && timerIntervalMs <= intervalMs { return }
    timer?.cancel()
    let source = DispatchSource.makeTimerSource(queue: queue)
    source.schedule(deadline: .now() + .milliseconds(intervalMs), repeating: .milliseconds(intervalMs), leeway: .milliseconds(20))
    source.setEventHandler { [weak self] in
      guard let self = self, !self.watches.isEmpty else { return }
      let sample = self.sample()
      for watch in self.watches.values { watch.add(sample) }
    }
    source.resume()
    timer = source
    timerIntervalMs = intervalMs
  }

  private func sample() -> Sample {
    let vm = DeviceMetricsModule.vmInfo()
    return Sample(
      uptime: ProcessInfo.processInfo.systemUptime,
      cpuMs: DeviceMetricsModule.cpuTimeMs(),
      footprint: vm?.footprint ?? 0,
      thermal: ProcessInfo.processInfo.thermalState.rawValue,
      battery: currentBattery().level
    )
  }

  private func snapshot() -> [String: Any] {
    var out: [String: Any] = [
      "platform": "ios",
      "uptimeMs": ProcessInfo.processInfo.systemUptime * 1000,
      "cpuTimeMs": DeviceMetricsModule.cpuTimeMs(),
      "cpuCores": ProcessInfo.processInfo.activeProcessorCount,
      "deviceTotalBytes": Double(ProcessInfo.processInfo.physicalMemory),
      "thermalState": DeviceMetricsModule.thermalName(ProcessInfo.processInfo.thermalState),
      "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
    ]
    if let vm = DeviceMetricsModule.vmInfo() {
      out["appMemoryBytes"] = Double(vm.footprint)
      out["appResidentBytes"] = Double(vm.resident)
      if let peak = vm.peak { out["appLifetimePeakBytes"] = Double(peak) }
    }
    out["appHeadroomBytes"] = Double(os_proc_available_memory())
    if let free = DeviceMetricsModule.deviceFreeBytes() { out["deviceAvailableBytes"] = Double(free) }
    let battery = currentBattery()
    if battery.level >= 0 { out["batteryLevel"] = Double(battery.level) }
    out["batteryState"] = DeviceMetricsModule.batteryName(battery.state)
    return out
  }

  private func refreshBattery() {
    let level = UIDevice.current.batteryLevel
    let state = UIDevice.current.batteryState
    batteryLock.lock()
    batteryLevel = level
    batteryState = state
    batteryLock.unlock()
  }

  private func currentBattery() -> (level: Float, state: UIDevice.BatteryState) {
    batteryLock.lock()
    defer { batteryLock.unlock() }
    return (batteryLevel, batteryState)
  }

  // MARK: - System reads

  private static let host = mach_host_self()

  static func vmInfo() -> (footprint: UInt64, resident: UInt64, peak: UInt64?)? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return nil }
    // The lifetime peak is a later revision of the struct; only trust it
    // when the kernel filled that far.
    var peak: UInt64? = nil
    if let offset = MemoryLayout<task_vm_info_data_t>.offset(of: \task_vm_info_data_t.ledger_phys_footprint_peak),
       Int(count) * MemoryLayout<integer_t>.size >= offset + MemoryLayout<Int64>.size {
      peak = UInt64(max(0, info.ledger_phys_footprint_peak))
    }
    return (UInt64(info.phys_footprint), UInt64(info.resident_size), peak)
  }

  static func cpuTimeMs() -> Double {
    var usage = rusage()
    guard getrusage(RUSAGE_SELF, &usage) == 0 else { return 0 }
    let user = Double(usage.ru_utime.tv_sec) * 1000 + Double(usage.ru_utime.tv_usec) / 1000
    let system = Double(usage.ru_stime.tv_sec) * 1000 + Double(usage.ru_stime.tv_usec) / 1000
    return user + system
  }

  // Free plus inactive pages: a rough "available" figure. iOS keeps RAM full
  // on purpose, so the app's headroom is the number that matters.
  static func deviceFreeBytes() -> UInt64? {
    var stats = vm_statistics64_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
    let result = withUnsafeMutablePointer(to: &stats) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        host_statistics64(host, HOST_VM_INFO64, $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return nil }
    var pageSize: vm_size_t = 0
    host_page_size(host, &pageSize)
    return (UInt64(stats.free_count) + UInt64(stats.inactive_count)) * UInt64(pageSize)
  }

  static func thermalName(_ state: ProcessInfo.ThermalState) -> String {
    switch state {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }

  static func thermalName(raw: Int) -> String {
    return thermalName(ProcessInfo.ThermalState(rawValue: raw) ?? .nominal)
  }

  static func batteryName(_ state: UIDevice.BatteryState) -> String {
    switch state {
    case .charging: return "charging"
    case .full: return "full"
    case .unplugged: return "unplugged"
    default: return "unknown"
    }
  }
}

struct Sample {
  let uptime: TimeInterval
  let cpuMs: Double
  let footprint: UInt64
  let thermal: Int
  let battery: Float
}

// Peaks and averages for one watch. Only touched on the module's queue.
final class Watch {
  let start: Sample
  private var last: Sample
  private var peakFootprint: UInt64
  private var footprintSum: Double
  private var peakCpuPercent: Double = 0
  private var worstThermal: Int
  private var samples = 1

  init(start: Sample) {
    self.start = start
    self.last = start
    self.peakFootprint = start.footprint
    self.footprintSum = Double(start.footprint)
    self.worstThermal = start.thermal
  }

  func add(_ sample: Sample) {
    let wallMs = (sample.uptime - last.uptime) * 1000
    // Skip intervals too short to say anything (a read right after a tick).
    if wallMs >= 50 {
      peakCpuPercent = max(peakCpuPercent, (sample.cpuMs - last.cpuMs) / wallMs * 100)
    }
    peakFootprint = max(peakFootprint, sample.footprint)
    footprintSum += Double(sample.footprint)
    worstThermal = max(worstThermal, sample.thermal)
    samples += 1
    last = sample
  }

  func summary() -> [String: Any] {
    let durationMs = (last.uptime - start.uptime) * 1000
    var out: [String: Any] = [
      "durationMs": durationMs,
      "samples": samples,
      "cpuTimeMs": last.cpuMs - start.cpuMs,
      "avgCpuPercent": durationMs > 0 ? (last.cpuMs - start.cpuMs) / durationMs * 100 : 0,
      "peakCpuPercent": peakCpuPercent,
      "startMemoryBytes": Double(start.footprint),
      "endMemoryBytes": Double(last.footprint),
      "peakMemoryBytes": Double(peakFootprint),
      "avgMemoryBytes": footprintSum / Double(samples),
      "worstThermalState": DeviceMetricsModule.thermalName(raw: worstThermal),
    ]
    if start.battery >= 0 { out["startBatteryLevel"] = Double(start.battery) }
    if last.battery >= 0 { out["endBatteryLevel"] = Double(last.battery) }
    return out
  }
}
