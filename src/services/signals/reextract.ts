import { getDatabase } from "../db/database";
import { AUDIO_EXTRACTOR_VERSION } from "../../domain/dsp/audioFeatures";
import { logger } from "../../utils/logger";

// When the audio extractor improves (AUDIO_EXTRACTOR_VERSION changes), takes
// that still have their video (this month's, and every month's keepsakes)
// are measured again, a few per launch, and rescored. Takes whose video is
// gone keep the feature track they were measured with; its version says
// which extractor made it. Takes with no feature track at all are left
// alone (decided: nothing from before session 06 is converted).

const PER_LAUNCH = 3;

export async function reextractStaleSignals(): Promise<void> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT s.id FROM sessions s JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'signals'
       WHERE s.deleted_at IS NULL AND s.video_deleted_at IS NULL AND s.status IN ('done', 'error')
         AND json_extract(a.json, '$.audio.extractor.version') IS NOT NULL
         AND json_extract(a.json, '$.audio.extractor.version') != ?
       ORDER BY s.recorded_at DESC LIMIT ?`,
      [AUDIO_EXTRACTOR_VERSION, PER_LAUNCH],
    );
    if (!rows.length) return;
    // Loaded late: the pipeline pulls in most of the app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requestStep } = require("../pipeline/sessionPipeline") as typeof import("../pipeline/sessionPipeline");
    for (const row of rows) {
      logger.info(`[signals] ${row.id}: measured by an older extractor, measuring again`);
      await requestStep(row.id, "audio_metrics", { quiet: true });
    }
  } catch (error) {
    logger.warn(`[signals] re-extract check failed — ${(error as Error).message}`);
  }
}
