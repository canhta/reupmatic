// Envelope follower for the live program monitor. It mirrors the static curve in
// app/core/editing/live-mix.ts and worker/media/audio/mixing.py; the numbers are set
// from the main thread so there is one source of truth. Outputs the music gain (0..1).
class DuckEnvelope extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'thresholdDb', defaultValue: -28.285714, automationRate: 'k-rate' },
      { name: 'amountDb', defaultValue: 9, minValue: 0, maxValue: 60, automationRate: 'k-rate' },
      { name: 'ratio', defaultValue: 8, minValue: 1, maxValue: 20, automationRate: 'k-rate' },
      {
        name: 'attack',
        defaultValue: 0.998959,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'release',
        defaultValue: 0.999949,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
  }

  process(inputs, outputs, parameters) {
    const key = inputs[0]?.[0];
    const out = outputs[0][0];
    const thresholdDb = parameters.thresholdDb[0];
    const ratio = parameters.ratio[0];
    const attack = parameters.attack[0];
    const release = parameters.release[0];
    for (let i = 0; i < out.length; i += 1) {
      const sample = key ? Math.abs(key[i]) : 0;
      const coefficient = sample > this.envelope ? attack : release;
      this.envelope = coefficient * this.envelope + (1 - coefficient) * sample;
      const db = this.envelope > 1e-7 ? 20 * Math.log10(this.envelope) : -Infinity;
      const reduction = db > thresholdDb ? (db - thresholdDb) * (1 - 1 / ratio) : 0;
      out[i] = 10 ** (-reduction / 20);
    }
    return true;
  }
}

registerProcessor('duck-envelope', DuckEnvelope);
