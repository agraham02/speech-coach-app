// Where the oval on the camera preview sits, and whether a face is really
// inside it. The face landmarker reports the face as a box in the camera
// image (0-1), and the preview crops that image to fill the view, so the box
// has to be mapped into view pixels before it can be compared with the oval
// drawn on screen. The old check (faceFraming.ts: the box's center anywhere
// in a wide zone) said "centered" while the face was still well off the
// oval. Pure.

export type FramingStatus = "none" | "off_center" | "good";

export interface Size {
  width: number;
  height: number;
}

// The oval in view pixels.
export interface GuideOval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// The oval and the view it is measured against: the overlay draws the oval
// and the face hooks judge a face against it, so both read the same thing.
export interface GuideGeometry {
  view: Size;
  oval: GuideOval;
}

export interface GuideReading {
  status: FramingStatus;
  // What to change, in words: "Move a little to the left". Null when good.
  hint: string | null;
}

// As drawn: 240 x 310, with a pill and the controls beneath it.
const OVAL_WIDTH = 240;
const OVAL_HEIGHT = 310;
const OVAL_ASPECT = OVAL_HEIGHT / OVAL_WIDTH;
const BOTTOM_RESERVE = 200;
const TOP_MARGIN = 16;
const MAX_HEIGHT_SHARE = 0.62;
const MIN_HEIGHT = 120;

// The oval for a view of this size: full size on a phone, smaller on a short
// preview, sitting above the room kept for the status pill and controls.
export function guideOval(view: Size): GuideOval {
  const maxHeight = Math.max(MIN_HEIGHT, Math.min(OVAL_HEIGHT, view.height * MAX_HEIGHT_SHARE, view.height - BOTTOM_RESERVE - TOP_MARGIN));
  const width = Math.min(OVAL_WIDTH, maxHeight / OVAL_ASPECT, view.width * 0.8);
  const height = width * OVAL_ASPECT;
  const bottom = Math.max(height + TOP_MARGIN, view.height - BOTTOM_RESERVE);
  return { cx: view.width / 2, cy: bottom - height / 2, rx: width / 2, ry: height / 2 };
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// The face box (fractions of the camera image) in view pixels. The preview
// scales the image until it covers the view and crops the overflow equally
// on both sides.
export function faceBoxInView(bounds: [number, number, number, number], image: Size, view: Size): Box {
  const usable = image.width > 0 && image.height > 0 && Number.isFinite(image.width) && Number.isFinite(image.height);
  const picture = usable ? image : view;
  const scale = Math.max(view.width / picture.width, view.height / picture.height);
  const width = picture.width * scale;
  const height = picture.height * scale;
  const offsetX = (width - view.width) / 2;
  const offsetY = (height - view.height) / 2;
  const [minX, minY, maxX, maxY] = bounds;
  return { left: minX * width - offsetX, top: minY * height - offsetY, right: maxX * width - offsetX, bottom: maxY * height - offsetY };
}

// How far the face's center is from the oval's, as a share of the oval's
// radius (0: dead center, 1: on the edge).
const CENTER_ENTER = 0.45;
// Once good, it stays good until the face drifts this far, so the status
// doesn't flicker at the line.
const CENTER_STAY = 0.62;
// The face's width as a share of the oval's width: far enough from the phone
// that the face fits, close enough that it fills the oval.
const SIZE_ENTER: [number, number] = [0.5, 1.0];
const SIZE_STAY: [number, number] = [0.42, 1.1];

export function readGuide(face: { bounds: [number, number, number, number]; width?: number; height?: number }, geometry: GuideGeometry, previous: FramingStatus = "off_center"): GuideReading {
  const { view, oval } = geometry;
  const box = faceBoxInView(face.bounds, { width: face.width ?? 0, height: face.height ?? 0 }, view);
  const dx = ((box.left + box.right) / 2 - oval.cx) / oval.rx;
  const dy = ((box.top + box.bottom) / 2 - oval.cy) / oval.ry;
  const size = (box.right - box.left) / (oval.rx * 2);
  const offset = Math.hypot(dx, dy);
  const stay = previous === "good";
  const [minSize, maxSize] = stay ? SIZE_STAY : SIZE_ENTER;

  if (size < minSize) return { status: "off_center", hint: "Move a little closer" };
  if (size > maxSize) return { status: "off_center", hint: "Move back a little" };
  if (offset <= (stay ? CENTER_STAY : CENTER_ENTER)) return { status: "good", hint: null };
  if (Math.abs(dx) >= Math.abs(dy)) return { status: "off_center", hint: dx > 0 ? "Move a little to the left" : "Move a little to the right" };
  return { status: "off_center", hint: dy > 0 ? "Move up a little" : "Move down a little" };
}
