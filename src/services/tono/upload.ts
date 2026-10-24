import { File } from "expo-file-system";
import { withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";
import { reviewUploadCopy } from "../storage/videoTranscode";
import { tonoFileStatus, tonoUploadStart } from "./tonoApi";

// Sending a take's video for Tono AI to watch (the Dev "judge from the
// video" setting, or a take with no transcript). Tono's server starts the
// upload with Google, so the key never reaches the phone, and hands back only
// the upload URL; the bytes go straight from here to Google. The file is
// deleted from Google once the take is judged (or the take is deleted).

export interface UploadedFile {
  name: string; // e.g. "files/abc123"
  uri: string;
  mimeType: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

// Streams the file from disk (never buffered whole in JS memory).
async function uploadBytes(uploadUrl: string, fileUri: string, mimeType: string): Promise<UploadedFile> {
  const file = new File(fileUri);
  const result = await withDeadline(
    file.upload(uploadUrl, {
      httpMethod: "POST",
      mimeType,
      headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    }),
    10 * 60_000,
    "Uploading the video",
  );
  if (result.status < 200 || result.status >= 300) throw new UploadError(`Video upload failed (${result.status})`, result.status);
  return (JSON.parse(result.body) as { file: UploadedFile }).file;
}

async function fileInfo(fileName: string): Promise<UploadedFile> {
  const info = await tonoFileStatus(fileName);
  return { name: info.name, uri: info.uri, mimeType: info.mimeType, state: info.state as UploadedFile["state"] };
}

export async function waitForFileActive(fileName: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    const data = await fileInfo(fileName);
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new UploadError(`Google couldn't process ${fileName}`);
    await new Promise((resolve) => setTimeout(resolve, opts.intervalMs ?? 3000));
  }
  throw new UploadError(`Timed out waiting for ${fileName} to be ready`);
}

// A one-shot reuse check for an earlier upload. False for anything but a
// confirmed ACTIVE file, so the caller can always fall back to a fresh upload.
export async function checkExistingFileActive(fileName: string): Promise<boolean> {
  try {
    return (await fileInfo(fileName)).state === "ACTIVE";
  } catch {
    return false;
  }
}

// Uploads a smaller copy (720p at about 1 Mb/s: the model samples a frame a
// second, so it sees the same thing) and waits until Google is ready with it.
export async function uploadVideoForGrading(videoUri: string): Promise<UploadedFile> {
  const copy = await reviewUploadCopy(videoUri);
  let uploaded: UploadedFile;
  try {
    const sizeBytes = new File(copy.uri).size;
    const { uploadUrl } = await tonoUploadStart({ sizeBytes, mimeType: "video/mp4" });
    uploaded = await uploadBytes(uploadUrl, copy.uri, "video/mp4");
  } finally {
    copy.cleanup();
  }
  logger.info(`[upload] ${uploaded.name} uploaded (state=${uploaded.state})`);
  await waitForFileActive(uploaded.name);
  return uploaded;
}

export interface ExistingUpload {
  name: string;
  uri: string;
  uploadedAt: string; // ISO datetime
}

// Google keeps an upload 48 h; a 1 h margin keeps a slow retry from reusing
// one that expires mid-request.
const FILE_REUSE_WINDOW_MS = 47 * 60 * 60 * 1000;

// Reuses a fresh, still-ACTIVE upload from an earlier attempt, or uploads
// again. `reused: false` tells the caller to store the new file's name.
export async function resolveUploadForGrading(videoUri: string, existing: ExistingUpload | null): Promise<{ uploaded: UploadedFile; reused: boolean }> {
  const fresh = existing && Date.now() - Date.parse(existing.uploadedAt) < FILE_REUSE_WINDOW_MS;
  if (existing && fresh && (await checkExistingFileActive(existing.name))) {
    logger.info(`[upload] reusing ${existing.name}`);
    return { uploaded: { name: existing.name, uri: existing.uri, mimeType: "video/mp4", state: "ACTIVE" }, reused: true };
  }
  return { uploaded: await uploadVideoForGrading(videoUri), reused: false };
}
