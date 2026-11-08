Pod::Spec.new do |s|
  s.name           = 'TonoLanguage'
  s.version        = '1.0.0'
  s.summary        = 'Apple\'s built-in English word and sentence embeddings.'
  s.description    = 'A tiny Expo module around NLEmbedding, which gives each word or sentence a vector so the app can tell how close two of them are in meaning. It works offline and needs no download.'
  s.license        = 'MIT'
  s.author         = 'Ahmad Graham'
  s.homepage       = 'https://developer.apple.com/documentation/naturallanguage/nlembedding'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'NaturalLanguage'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
