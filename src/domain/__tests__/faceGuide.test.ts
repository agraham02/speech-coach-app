import { faceBoxInView, guideOval, readGuide, type GuideGeometry } from "../faceGuide";

const phone = { width: 390, height: 844 };
const geometry = (view = phone): GuideGeometry => ({ view, oval: guideOval(view) });

// A face box of `width` (a share of the oval's width) centered `dx`/`dy`
// (shares of the oval's radii) from the oval's center, on a picture that fills
// the view with no crop.
function faceAt(g: GuideGeometry, { dx = 0, dy = 0, width = 0.75 } = {}) {
  const { view, oval } = g;
  const w = width * oval.rx * 2;
  const h = w * 1.25;
  const cx = oval.cx + dx * oval.rx;
  const cy = oval.cy + dy * oval.ry;
  return { bounds: [(cx - w / 2) / view.width, (cy - h / 2) / view.height, (cx + w / 2) / view.width, (cy + h / 2) / view.height] as [number, number, number, number], width: view.width, height: view.height };
}

describe("the oval", () => {
  it("is the size it was drawn at on a phone, with room left beneath it", () => {
    const o = guideOval(phone);
    expect(o.rx * 2).toBe(240);
    expect(o.ry * 2).toBe(310);
    expect(o.cx).toBe(195);
    // The same place the overlay used to put it: 200 up from the bottom.
    expect(o.cy + o.ry).toBe(844 - 200);
  });

  it("shrinks to fit a short preview and stays inside it", () => {
    const o = guideOval({ width: 390, height: 360 });
    expect(o.ry * 2).toBeLessThan(310);
    expect(o.cy - o.ry).toBeGreaterThanOrEqual(0);
    expect(o.cy + o.ry).toBeLessThanOrEqual(360);
    expect(o.ry / o.rx).toBeCloseTo(310 / 240, 5);
  });
});

describe("a face box on a cropped preview", () => {
  it("maps with no change when the picture is the view's shape", () => {
    const box = faceBoxInView([0.25, 0.25, 0.75, 0.75], { width: 1080, height: 1920 }, { width: 540, height: 960 });
    expect(box).toEqual({ left: 135, top: 240, right: 405, bottom: 720 });
  });

  it("accounts for the picture being cropped to fill the view", () => {
    // A tall picture in a squarer view is scaled to the width and cropped top and bottom.
    const view = { width: 400, height: 500 };
    const box = faceBoxInView([0.4, 0.3, 0.6, 0.4], { width: 1080, height: 1920 }, view);
    const scaledHeight = (1920 / 1080) * 400;
    expect(box.top).toBeCloseTo(0.3 * scaledHeight - (scaledHeight - 500) / 2, 5);
    expect(box.left).toBeCloseTo(160, 5);
    // Reading the same fractions against the view directly would put it ~40 px lower.
    expect(0.3 * 500 - box.top).toBeGreaterThan(40);
  });

  it("falls back to the view's shape if the picture size is unknown", () => {
    const box = faceBoxInView([0, 0, 1, 1], { width: 0, height: 0 }, { width: 300, height: 600 });
    expect(box).toEqual({ left: 0, top: 0, right: 300, bottom: 600 });
  });
});

describe("whether a face is in the oval", () => {
  const g = geometry();

  it("is good in the middle at a good size", () => {
    expect(readGuide(faceAt(g), g)).toEqual({ status: "good", hint: null });
  });

  it("is not good just because the face is somewhere on screen", () => {
    // Well inside the old wide zone (15-85% across), yet clearly off the oval.
    const off = faceAt(g, { dx: 0.9 });
    expect(readGuide(off, g).status).toBe("off_center");
    expect(readGuide(faceAt(g, { dy: -0.9 }), g).status).toBe("off_center");
  });

  it("says which way to move, in terms of the screen", () => {
    expect(readGuide(faceAt(g, { dx: 0.9 }), g).hint).toBe("Move a little to the left");
    expect(readGuide(faceAt(g, { dx: -0.9 }), g).hint).toBe("Move a little to the right");
    expect(readGuide(faceAt(g, { dy: 0.9 }), g).hint).toBe("Move up a little");
    expect(readGuide(faceAt(g, { dy: -0.9 }), g).hint).toBe("Move down a little");
  });

  it("asks for a closer or further face when the size is off", () => {
    expect(readGuide(faceAt(g, { width: 0.3 }), g).hint).toBe("Move a little closer");
    expect(readGuide(faceAt(g, { width: 1.3 }), g).hint).toBe("Move back a little");
  });

  it("holds good a little past where it first turned good", () => {
    const drifting = faceAt(g, { dx: 0.55 });
    expect(readGuide(drifting, g, "off_center").status).toBe("off_center");
    expect(readGuide(drifting, g, "good").status).toBe("good");
    expect(readGuide(faceAt(g, { dx: 0.8 }), g, "good").status).toBe("off_center");
  });

  it("judges against the oval on a cropped preview", () => {
    // A short view of a tall picture: scaled to the width, cropped top and bottom.
    const view = { width: 390, height: 420 };
    const gg = geometry(view);
    const image = { width: 1080, height: 1920 };
    const scaledHeight = (1920 / 1080) * 390;
    // The image row that lands on the oval's center, and the face width that fills it well.
    const row = (gg.oval.cy + (scaledHeight - 420) / 2) / scaledHeight;
    const w = 0.75 * gg.oval.rx * 2;
    const bounds: [number, number, number, number] = [(gg.oval.cx - w / 2) / 390, row - 0.06, (gg.oval.cx + w / 2) / 390, row + 0.06];
    expect(readGuide({ bounds, ...image }, gg).status).toBe("good");
    // The face a little lower in the picture is off the oval, though it is still on screen.
    const lower: [number, number, number, number] = [bounds[0], row + 0.1, bounds[2], row + 0.22];
    expect(readGuide({ bounds: lower, ...image }, gg)).toEqual({ status: "off_center", hint: "Move up a little" });
  });
});
