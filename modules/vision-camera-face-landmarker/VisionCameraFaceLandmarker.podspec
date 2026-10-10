require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "VisionCameraFaceLandmarker"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/google-ai-edge/mediapipe.git", :tag => "v0.10.35" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  # Copied into the app bundle; loaded with Bundle.main.
  s.resources    = ["assets/face_landmarker.task"]

  s.dependency "React-Core"
  s.dependency "VisionCamera"
  s.dependency "MediaPipeTasksVision", "0.10.35"
end
