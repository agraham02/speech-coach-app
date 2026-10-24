import { TimeoutError } from "../../utils/fetchWithTimeout";
import { describeTonoError, TonoApiError } from "../tono/tonoError";
import { UploadError } from "../tono/upload";

// A failed Tono AI call, worded for the person.
export function describeCloudError(error: unknown): string {
  if (error instanceof TonoApiError) return describeTonoError(error);
  if (error instanceof UploadError) return "The video couldn't be sent. Check your connection and try again.";
  if (error instanceof TimeoutError) return `${error.message}. Check your connection and retry.`;
  if (error instanceof TypeError) return "Couldn't reach Tono AI. Check your internet connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
