import { takeOldDataWipe } from "../db/database";
import { clearLocalData } from "./resetApp";
import { logger } from "../../utils/logger";

// The 2.0.0 clean start (docs/overhaul/PLAN.md, section 14). The first time
// this version opens a database left by a 1.x build, the database is wiped
// (db/schema.ts). The videos, Rewind audio, preferences and reminders that
// went with those rows would be left pointing at nothing, so they go too, and
// the app starts as a fresh install, onboarding included. The Tono account and
// the downloaded on-device models are kept, as with Reset app.
//
// Runs once at launch, before the first screen, and does nothing unless the
// database was just wiped. If the app is killed between the wipe and this
// cleanup, the leftovers stay: they are test data, so Reset app clears them.
// Returns whether it cleaned anything.
export async function runCleanStart(): Promise<boolean> {
  try {
    if (!(await takeOldDataWipe())) return false;
    logger.info("[clean-start] old database wiped — clearing videos, audio and settings");
    const temp = await clearLocalData();
    logger.info(`[clean-start] done, ${temp} temp file(s) removed`);
    return true;
  } catch (error) {
    // Never keep someone out of the app over leftover files.
    logger.warn(`[clean-start] failed — ${(error as Error).message}`);
    return false;
  }
}
