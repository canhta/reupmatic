// ffprobe reports r_frame_rate as a ratio string ("30", "30000/1001"), never a decimal.
export function parseFrameRate(value: string): number {
  const [numerator, denominator] = value.split('/');
  const top = Number(numerator);
  const bottom = denominator === undefined ? 1 : Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= 0 || bottom <= 0)
    throw new Error('INVALID_FRAME_RATE');
  return top / bottom;
}
