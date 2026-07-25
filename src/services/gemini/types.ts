export interface UploadedGeminiFile {
  name: string; // e.g. "files/abc123"
  uri: string; // full file resource URI, used as file_data.file_uri
  mimeType: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

export interface GeminiPhase1Response {
  transcript_verbatim: string;
  transcript_clean: string;
  duration_seconds: number;
}

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}
