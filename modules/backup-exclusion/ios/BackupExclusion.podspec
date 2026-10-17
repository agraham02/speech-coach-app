Pod::Spec.new do |s|
  s.name           = 'BackupExclusion'
  s.version        = '1.0.0'
  s.summary        = 'Keeps files and folders out of iCloud and device backups.'
  s.description    = 'A tiny Expo module around the URL resource value isExcludedFromBackup, which expo-file-system does not expose.'
  s.license        = 'MIT'
  s.author         = 'Ahmad Graham'
  s.homepage       = 'https://developer.apple.com/library/archive/qa/qa1719/_index.html'
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
