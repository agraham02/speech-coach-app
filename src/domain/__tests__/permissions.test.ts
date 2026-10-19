import { fromCameraStatus, fromExpoResponse, needsAttention, stateLabel, tapAction } from "../permissions";

describe("permission states", () => {
  it("maps the camera library's statuses", () => {
    expect(fromCameraStatus("granted")).toBe("granted");
    expect(fromCameraStatus("not-determined")).toBe("ask");
    expect(fromCameraStatus("denied")).toBe("blocked");
    expect(fromCameraStatus("restricted")).toBe("blocked");
  });

  it("maps Expo's responses", () => {
    expect(fromExpoResponse({ granted: true, canAskAgain: true })).toBe("granted");
    expect(fromExpoResponse({ granted: false, canAskAgain: true })).toBe("ask");
    expect(fromExpoResponse({ granted: false, canAskAgain: false })).toBe("blocked");
  });

  it("only prompts while the system still will", () => {
    expect(tapAction("ask")).toBe("request");
    expect(tapAction("blocked")).toBe("settings");
    expect(tapAction("granted")).toBe("settings");
  });

  it("labels and filters", () => {
    expect(stateLabel("granted")).toBe("On");
    expect(stateLabel("blocked")).toBe("Off");
    expect(stateLabel("ask")).toBe("Not asked yet");
    expect(
      needsAttention([
        { key: "camera", state: "granted" },
        { key: "microphone", state: "blocked" },
      ]),
    ).toEqual([{ key: "microphone", state: "blocked" }]);
  });
});
