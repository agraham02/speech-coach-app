Pod::Spec.new do |s|
  s.name           = 'DeviceMetrics'
  s.version        = '1.0.0'
  s.summary        = 'Process memory, CPU time, thermal and battery readings for the Dev tab.'
  s.description    = 'A small Expo module around task_info, getrusage, os_proc_available_memory, ProcessInfo and UIDevice battery monitoring.'
  s.license        = 'MIT'
  s.author         = 'Ahmad Graham'
  s.homepage       = 'https://developer.apple.com/documentation/os/3191911-os_proc_available_memory'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
