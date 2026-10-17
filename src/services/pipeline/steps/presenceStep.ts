import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { computePresenceMetrics, type PresenceSample } from "../../../domain/presenceMetrics";
import { calibratedThresholds, normalizeTimeline } from "../../../domain/faceCalibration";
import { getFaceCalibration } from "../../prefs/prefsStore";
import { StepError } from "../stepRunner";
import { logger } from "../../../utils/logger";

// Video analysis, on-device: summarizes the face timeline captured while
// recording (eye contact, expressiveness, framing). Independent of audio.
export async function presenceStep(sessionId: string): Promise<void> {
  const timeline = await getArtifact<PresenceSample[]>(sessionId, "presence_timeline");
  if (!timeline) throw new StepError("No face data was captured for this take.");
  // Measured from this face's own "looking at the lens" when the face check has been done.
  const calibration = getFaceCalibration();
  const metrics = calibration ? computePresenceMetrics(normalizeTimeline(timeline, calibration), calibratedThresholds(calibration)) : computePresenceMetrics(timeline);
  if (!metrics) throw new StepError("Too little face data to analyze.");
  await putArtifact(sessionId, "presence", metrics);

  // The gaze thresholds were set without device data — these numbers in a
  // shared log are what tuning them needs.
  const present = timeline.filter((s) => s.present && s.gazeX !== undefined);
  if (present.length) {
    const q = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)].toFixed(2);
    const gx = present.map((s) => Math.abs(s.gazeX ?? 0));
    const gy = present.map((s) => s.gazeY ?? 0);
    const yaw = present.map((s) => Math.abs(s.yaw));
    logger.info(
      `[presence] ${sessionId}${calibration ? " (calibrated)" : ""}: eye contact ${metrics.eyeContactPercent}%, facing ${metrics.facingLensPercent}%, down ${metrics.lookingDownPercent}% | ` +
        `|gazeX| p50 ${q(gx, 0.5)} p90 ${q(gx, 0.9)}, gazeY p10 ${q(gy, 0.1)} p50 ${q(gy, 0.5)}, |yaw| p50 ${q(yaw, 0.5)} p90 ${q(yaw, 0.9)}`,
    );
  }
}
