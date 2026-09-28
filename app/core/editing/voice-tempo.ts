// The monitor's stand-in for FFmpeg `atempo`, which the render applies to each sped voice line and
// clip: WSOLA overlap-add changes duration while keeping pitch. Pure numbers, no DOM.

const FRAME_S = 0.03;
// Alignment search reads every Nth sample: speech below ~4 kHz is all the lag match needs.
const SEARCH_RATE_HZ = 8000;

function hann(size: number): Float32Array {
  return Float32Array.from(
    { length: size },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size),
  );
}

function correlation(
  samples: Float32Array,
  a: number,
  b: number,
  length: number,
  step: number,
): number {
  let sum = 0;
  for (let index = 0; index < length; index += step) sum += samples[a + index] * samples[b + index];
  return sum;
}

/**
 * `samples` played `rate` times faster at the same pitch; the result is `round(length / rate)`
 * samples. Natural speed returns a copy.
 */
export function stretchTempo(
  samples: Float32Array,
  sampleRate: number,
  rate: number,
): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error('VOICE_TEMPO_INVALID');
  const outLength = Math.round(samples.length / rate);
  if (rate === 1) return samples.slice();
  const frame = Math.max(2, 2 * Math.round((FRAME_S * sampleRate) / 2));
  const hop = frame / 2;
  if (samples.length < frame) {
    // Too short to overlap: resample the span; a tail this short has no audible pitch.
    return Float32Array.from(
      { length: outLength },
      (_, index) => samples[Math.min(samples.length - 1, Math.floor(index * rate))],
    );
  }
  const window = hann(frame);
  const tolerance = Math.floor(hop / 2);
  const step = Math.max(1, Math.round(sampleRate / SEARCH_RATE_HZ));
  const lastStart = samples.length - frame;
  const out = new Float32Array(outLength + frame);
  const weight = new Float32Array(outLength + frame);
  let previous = 0;
  for (let outStart = 0; outStart < outLength; outStart += hop) {
    let start = 0;
    if (outStart > 0) {
      // The frame whose head best continues the previous frame's natural tail, near nominal.
      const natural = Math.min(lastStart, previous + hop);
      const nominal = Math.min(lastStart, Math.round(outStart * rate));
      const low = Math.max(0, nominal - tolerance),
        high = Math.min(lastStart, nominal + tolerance);
      let best = nominal,
        bestScore = Number.NEGATIVE_INFINITY;
      const score = (candidate: number) => {
        const value = correlation(samples, natural, candidate, hop, step);
        if (value > bestScore) {
          bestScore = value;
          best = candidate;
        }
      };
      for (let candidate = low; candidate <= high; candidate += step) score(candidate);
      const coarse = best;
      for (
        let candidate = Math.max(low, coarse - step + 1);
        candidate <= Math.min(high, coarse + step - 1);
        candidate += 1
      )
        score(candidate);
      start = best;
    }
    for (let index = 0; index < frame; index += 1) {
      out[outStart + index] += samples[start + index] * window[index];
      weight[outStart + index] += window[index];
    }
    previous = start;
  }
  const result = new Float32Array(outLength);
  for (let index = 0; index < outLength; index += 1)
    result[index] = weight[index] > 1e-3 ? out[index] / weight[index] : out[index];
  return result;
}
