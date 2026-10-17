// Whether a detected face is well placed for a take. Shared by the recording
// screens (useFaceDetection) and the Dev tab's Face Lab.

// A generous "center" region as a fraction of the image: a face whose center
// falls outside this box (or is too small, i.e. too far away) does not count
// as well-framed even though it was technically detected. The preview fills
// the screen, so image fractions are close to screen fractions.
export const CENTER_ZONE = { xMin: 0.15, xMax: 0.85, yMin: 0.08, yMax: 0.85 };
export const MIN_FACE_WIDTH_RATIO = 0.12;

// bounds: [minX, minY, maxX, maxY], each 0-1.
export function isWellFramed(bounds: [number, number, number, number]): boolean {
  const [minX, minY, maxX, maxY] = bounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return (
    centerX >= CENTER_ZONE.xMin &&
    centerX <= CENTER_ZONE.xMax &&
    centerY >= CENTER_ZONE.yMin &&
    centerY <= CENTER_ZONE.yMax &&
    maxX - minX >= MIN_FACE_WIDTH_RATIO
  );
}
