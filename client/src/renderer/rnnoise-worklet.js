import { Rnnoise } from '@shiguredo/rnnoise-wasm';

// O build do RNNoise identifica o ambiente web pela presença de `window`.
// AudioWorkletGlobalScope não expõe esse alias, embora tenha as APIs WebAssembly
// necessárias; criar o alias local evita que a biblioteca rejeite o worklet.
if (typeof window === 'undefined') globalThis.window = globalThis;

const RNNOISE_FRAME_SIZE = 480;
const MAX_BUFFERED_SAMPLES = RNNOISE_FRAME_SIZE * 8;

function clampSample(value) {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputFrame = new Float32Array(RNNOISE_FRAME_SIZE);
    this.outputQueue = new Float32Array(MAX_BUFFERED_SAMPLES);
    this.outputRead = 0;
    this.outputWrite = 0;
    this.outputLength = 0;
    this.inputLength = 0;
    this.started = false;
    this.denoiseState = null;
    this.closed = false;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'close') {
        this.closed = true;
        this.denoiseState?.destroy();
        this.denoiseState = null;
      }
    };

    Rnnoise.load().then((rnnoise) => {
      if (this.closed) return;
      if (rnnoise.frameSize !== RNNOISE_FRAME_SIZE) {
        throw new Error(`Frame size RNNoise inesperado: ${rnnoise.frameSize}`);
      }
      this.denoiseState = rnnoise.createDenoiseState();
      this.port.postMessage({ type: 'ready', frameSize: rnnoise.frameSize });
    }).catch((error) => {
      this.port.postMessage({
        type: 'error',
        message: error?.message || 'Não foi possível carregar o RNNoise.'
      });
    });
  }

  enqueueFrame(frame) {
    if (frame.length > MAX_BUFFERED_SAMPLES - this.outputLength) return;
    for (const sample of frame) {
      this.outputQueue[this.outputWrite] = sample;
      this.outputWrite = (this.outputWrite + 1) % this.outputQueue.length;
    }
    this.outputLength += frame.length;
  }

  processInput(input) {
    let offset = 0;
    while (offset < input.length) {
      const copyLength = Math.min(input.length - offset, RNNOISE_FRAME_SIZE - this.inputLength);
      this.inputFrame.set(input.subarray(offset, offset + copyLength), this.inputLength);
      this.inputLength += copyLength;
      offset += copyLength;
      if (this.inputLength < RNNOISE_FRAME_SIZE) continue;

      const frame = this.inputFrame;
      for (let index = 0; index < frame.length; index += 1) frame[index] = clampSample(frame[index]) * 32768;
      this.denoiseState.processFrame(frame);
      for (let index = 0; index < frame.length; index += 1) frame[index] = clampSample(frame[index] / 32768);
      this.enqueueFrame(frame);
      this.inputLength = 0;
    }
  }

  writeOutput(output) {
    if (!this.started) {
      if (this.outputLength < RNNOISE_FRAME_SIZE * 2) {
        output.fill(0);
        return;
      }
      this.started = true;
    }
    for (let index = 0; index < output.length; index += 1) {
      if (this.outputLength === 0) {
        output[index] = 0;
        continue;
      }
      output[index] = this.outputQueue[this.outputRead];
      this.outputRead = (this.outputRead + 1) % this.outputQueue.length;
      this.outputLength -= 1;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const input = inputs[0]?.[0];
    if (!input || !this.denoiseState) {
      output.fill(0);
      return !this.closed;
    }
    this.processInput(input);
    this.writeOutput(output);
    return !this.closed;
  }
}

registerProcessor('rnnoise-processor', RnnoiseProcessor);
