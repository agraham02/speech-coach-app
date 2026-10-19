import { downloadSpaceMessage, formatSpace, lowForRecording, recordingSpaceMessage, shortfallForDownload } from "../storage";

describe("storage space", () => {
  it("formats sizes the way a phone's storage screen does", () => {
    expect(formatSpace(350_000_000)).toBe("350 MB");
    expect(formatSpace(1_240_000_000)).toBe("1.2 GB");
    expect(formatSpace(10)).toBe("1 MB");
  });

  it("asks for the download plus some headroom", () => {
    expect(shortfallForDownload(2_000_000_000, 574_000_000)).toBe(0);
    expect(shortfallForDownload(700_000_000, 574_000_000)).toBe(74_000_000);
    expect(shortfallForDownload(null, 574_000_000)).toBe(0);
    expect(downloadSpaceMessage(74_000_000)).toContain("about 74 MB");
  });

  it("warns before a recording when space is low", () => {
    expect(lowForRecording(300_000_000)).toBe(true);
    expect(lowForRecording(900_000_000)).toBe(false);
    expect(lowForRecording(null)).toBe(false);
    expect(recordingSpaceMessage(300_000_000)).toContain("300 MB free");
  });
});
