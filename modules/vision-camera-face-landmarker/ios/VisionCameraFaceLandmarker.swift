import AVFoundation
import Foundation
import MediaPipeTasksVision
import UIKit
import VisionCamera

// MediaPipe Face Landmarker as a VisionCamera frame processor plugin.
// Returns, for the first face: a handful of 3D landmarks (for head pose
// fallbacks), the face's bounding box, all 52 blendshapes (gaze, blinks,
// smile, brows…) and the facial transformation matrix (head pose), row-major.
// An empty dictionary means no face.
@objc(VisionCameraFaceLandmarker)
public class VisionCameraFaceLandmarker: FrameProcessorPlugin {
  // Nose tip, forehead, chin, face edges, outer eye corners, between the
  // eyes, inner lips — see src/index.ts for what each is used for.
  private static let landmarkIndices = [1, 10, 152, 234, 454, 33, 263, 168, 13, 14]
  // Face Landmarker rejects mirrored orientations. For the front camera in
  // portrait, `.right` is the un-mirrored equivalent of ML Kit's
  // `.leftMirrored` (upright, just flipped left-right). The others are
  // fallbacks tried until a face is found once, in case that's wrong on
  // some device.
  private static let orientations: [UIImage.Orientation] = [.right, .left, .up, .down]

  private static func parse(_ name: String) -> UIImage.Orientation? {
    switch name {
    case "up": return .up
    case "down": return .down
    case "left": return .left
    case "right": return .right
    default: return nil
    }
  }

  private static func name(_ orientation: UIImage.Orientation) -> String {
    switch orientation {
    case .up: return "up"
    case .down: return "down"
    case .left: return "left"
    case .right: return "right"
    default: return "other"
    }
  }
  private static let missesBeforeNextOrientation = 15

  private var landmarker: FaceLandmarker?
  private var lastTimestampMs = 0
  private var orientationIndex = 0
  private var orientationLocked = false
  private var consecutiveMisses = 0

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = [:]) {
    super.init(proxy: proxy, options: options)
    landmarker = Self.makeLandmarker()
  }

  private static func makeLandmarker() -> FaceLandmarker? {
    guard let path = Bundle.main.path(forResource: "face_landmarker", ofType: "task") else {
      NSLog("[FaceLandmarker] face_landmarker.task is missing from the app bundle")
      return nil
    }
    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.runningMode = .video
    options.numFaces = 1
    options.minFaceDetectionConfidence = 0.5
    options.minFacePresenceConfidence = 0.5
    options.minTrackingConfidence = 0.5
    options.outputFaceBlendshapes = true
    options.outputFacialTransformationMatrixes = true
    do {
      return try FaceLandmarker(options: options)
    } catch {
      NSLog("[FaceLandmarker] failed to create: \(error)")
      return nil
    }
  }

  private func noteMiss() {
    if orientationLocked { return }
    consecutiveMisses += 1
    if consecutiveMisses >= Self.missesBeforeNextOrientation {
      consecutiveMisses = 0
      orientationIndex = (orientationIndex + 1) % Self.orientations.count
    }
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any {
    guard let landmarker = landmarker else { return ["error": "unavailable"] }
    // The Dev tab Face Lab can ask for a specific orientation (to compare
    // them); everything else uses the automatic choice.
    let requested = (arguments?["orientation"] as? String).flatMap(Self.parse)
    let orientation = requested ?? Self.orientations[orientationIndex]
    do {
      let image = try MPImage(sampleBuffer: frame.buffer, orientation: orientation)
      // Video mode needs strictly increasing timestamps.
      var timestamp = Int(Date().timeIntervalSince1970 * 1000)
      if timestamp <= lastTimestampMs { timestamp = lastTimestampMs + 1 }
      lastTimestampMs = timestamp

      let result = try landmarker.detect(videoFrame: image, timestampInMilliseconds: timestamp)
      guard let face = result.faceLandmarks.first, !face.isEmpty else {
        if requested == nil { noteMiss() }
        return [String: Any]()
      }
      if requested == nil { orientationLocked = true }
      consecutiveMisses = 0

      let sideways = orientation == .left || orientation == .right
      let width = Double(sideways ? frame.height : frame.width)
      let height = Double(sideways ? frame.width : frame.height)

      var minX = 1.0, minY = 1.0, maxX = 0.0, maxY = 0.0
      for point in face {
        minX = min(minX, Double(point.x)); maxX = max(maxX, Double(point.x))
        minY = min(minY, Double(point.y)); maxY = max(maxY, Double(point.y))
      }

      var landmarks: [Double] = []
      for index in Self.landmarkIndices where index < face.count {
        let point = face[index]
        landmarks.append(contentsOf: [Double(point.x), Double(point.y), Double(point.z)])
      }

      var blendshapes: [String: Double] = [:]
      if let categories = result.faceBlendshapes.first?.categories {
        for category in categories {
          if let name = category.categoryName { blendshapes[name] = Double(category.score) }
        }
      }

      var matrix: [Double] = []
      if let m = result.facialTransformationMatrixes.first, m.rows == 4, m.columns == 4 {
        for row in 0..<4 {
          for column in 0..<4 {
            matrix.append(Double(m.value(atRow: UInt(row), column: UInt(column))))
          }
        }
      }

      return [
        "width": width,
        "height": height,
        "bounds": [minX, minY, maxX, maxY],
        "landmarks": landmarks,
        "blendshapes": blendshapes,
        "matrix": matrix,
        "orientation": Self.name(orientation),
      ] as [String: Any]
    } catch {
      NSLog("[FaceLandmarker] detection failed: \(error)")
      return ["error": "\(error)"]
    }
  }
}
