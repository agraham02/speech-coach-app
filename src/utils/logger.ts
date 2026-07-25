/* eslint-disable no-console */
import { pushLog } from "../services/logs/logStore";

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export const logger = {
  info: (...args: unknown[]) => {
    console.log("[info]", ...args);
    pushLog("info", formatArgs(args));
  },
  warn: (...args: unknown[]) => {
    console.warn("[warn]", ...args);
    pushLog("warn", formatArgs(args));
  },
  error: (...args: unknown[]) => {
    console.error("[error]", ...args);
    pushLog("error", formatArgs(args));
  },
};
