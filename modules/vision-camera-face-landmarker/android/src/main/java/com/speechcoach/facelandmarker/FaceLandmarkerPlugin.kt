package com.speechcoach.facelandmarker

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val TAG = "FaceLandmarker"

// MediaPipe Face Landmarker as a VisionCamera frame processor plugin — the
// Android twin of ios/VisionCameraFaceLandmarker.swift (same output shape;
// the matrix here is column-major, which the JS side detects).
class FaceLandmarkerPlugin(private val context: Context) : FrameProcessorPlugin() {
  companion object {
    private val LANDMARK_INDICES = intArrayOf(1, 10, 152, 234, 454, 33, 263, 168, 13, 14)
    // Added to CameraX's rotation; the fallbacks are only tried until a face
    // is found once.
    private val ROTATION_OFFSETS = intArrayOf(0, 180, 90, 270)
    private const val MISSES_BEFORE_NEXT_ROTATION = 15
  }

  private val landmarker: FaceLandmarker? = create()
  private var lastTimestampMs = 0L
  private var rotationIndex = 0
  private var rotationLocked = false
  private var consecutiveMisses = 0

  private fun create(): FaceLandmarker? {
    return try {
      // Loaded into a buffer rather than by asset path, so it works even if
      // the build compresses the .task asset.
      val bytes = context.assets.open("face_landmarker.task").use { it.readBytes() }
      val buffer = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
      buffer.put(bytes)
      buffer.rewind()
      val options = FaceLandmarker.FaceLandmarkerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(buffer).build())
        .setRunningMode(RunningMode.VIDEO)
        .setNumFaces(1)
        .setMinFaceDetectionConfidence(0.5f)
        .setMinFacePresenceConfidence(0.5f)
        .setMinTrackingConfidence(0.5f)
        .setOutputFaceBlendshapes(true)
        .setOutputFacialTransformationMatrixes(true)
        .build()
      FaceLandmarker.createFromOptions(context, options)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to create the face landmarker", e)
      null
    }
  }

  private fun noteMiss() {
    if (rotationLocked) return
    consecutiveMisses += 1
    if (consecutiveMisses >= MISSES_BEFORE_NEXT_ROTATION) {
      consecutiveMisses = 0
      rotationIndex = (rotationIndex + 1) % ROTATION_OFFSETS.size
    }
  }

  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    val landmarker = landmarker ?: return mapOf("error" to "unavailable")
    try {
      val imageProxy = frame.imageProxy
      val rotation = (imageProxy.imageInfo.rotationDegrees + ROTATION_OFFSETS[rotationIndex]) % 360
      val bitmap = imageProxy.toBitmap()
      val image = BitmapImageBuilder(bitmap).build()
      val processing = ImageProcessingOptions.builder().setRotationDegrees(rotation).build()

      // Video mode needs strictly increasing timestamps.
      var timestamp = SystemClock.uptimeMillis()
      if (timestamp <= lastTimestampMs) timestamp = lastTimestampMs + 1
      lastTimestampMs = timestamp

      val result = landmarker.detectForVideo(image, processing, timestamp)
      val face = result.faceLandmarks().firstOrNull()
      if (face.isNullOrEmpty()) {
        noteMiss()
        return HashMap<String, Any>()
      }
      rotationLocked = true
      consecutiveMisses = 0

      val sideways = rotation == 90 || rotation == 270
      val width = (if (sideways) bitmap.height else bitmap.width).toDouble()
      val height = (if (sideways) bitmap.width else bitmap.height).toDouble()

      var minX = 1.0
      var minY = 1.0
      var maxX = 0.0
      var maxY = 0.0
      for (point in face) {
        minX = minOf(minX, point.x().toDouble()); maxX = maxOf(maxX, point.x().toDouble())
        minY = minOf(minY, point.y().toDouble()); maxY = maxOf(maxY, point.y().toDouble())
      }

      val landmarks = ArrayList<Double>()
      for (index in LANDMARK_INDICES) {
        if (index >= face.size) continue
        val point = face[index]
        landmarks.add(point.x().toDouble()); landmarks.add(point.y().toDouble()); landmarks.add(point.z().toDouble())
      }

      val blendshapes = HashMap<String, Any>()
      result.faceBlendshapes().orElse(null)?.firstOrNull()?.forEach { category ->
        blendshapes[category.categoryName()] = category.score().toDouble()
      }

      val matrix = ArrayList<Double>()
      result.facialTransformationMatrixes().orElse(null)?.firstOrNull()?.let { values ->
        if (values.size == 16) values.forEach { matrix.add(it.toDouble()) }
      }

      return hashMapOf<String, Any>(
        "width" to width,
        "height" to height,
        "bounds" to arrayListOf(minX, minY, maxX, maxY),
        "landmarks" to landmarks,
        "blendshapes" to blendshapes,
        "matrix" to matrix,
      )
    } catch (e: Throwable) {
      Log.e(TAG, "Face landmark detection failed", e)
      return mapOf("error" to (e.message ?: "detection failed"))
    }
  }
}
