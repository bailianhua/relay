// Captures microphone audio and streams raw s16le PCM (48kHz stereo) over WebSocket.
// The server feeds this directly into @discordjs/voice as StreamType.Raw.

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_SAMPLES = 960; // 20ms at 48kHz

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
  }
  return out;
}

export interface MicStreamHandle {
  stop: () => void;
}

export async function startMicStream(guildId: string): Promise<MicStreamHandle> {
  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = ctx.createMediaStreamSource(mediaStream);

  const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${wsProtocol}://${location.host}/ws/audio/${guildId}`);
  ws.binaryType = "arraybuffer";

  // Accumulate samples across ScriptProcessor callbacks until we have a full frame
  let pending = new Int16Array(FRAME_SAMPLES * CHANNELS);
  let pendingOffset = 0;

  // bufferSize must be power of 2; 4096 = ~85ms latency, acceptable for voice relay
  const processor = ctx.createScriptProcessor(4096, CHANNELS, CHANNELS);

  processor.onaudioprocess = (e) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const left = e.inputBuffer.getChannelData(0);
    const right = e.inputBuffer.getChannelData(1) ?? e.inputBuffer.getChannelData(0);

    const leftI16 = float32ToInt16(left);
    const rightI16 = float32ToInt16(right);

    for (let i = 0; i < leftI16.length; i++) {
      pending[pendingOffset * CHANNELS] = leftI16[i];
      pending[pendingOffset * CHANNELS + 1] = rightI16[i];
      pendingOffset++;

      if (pendingOffset >= FRAME_SAMPLES) {
        ws.send(pending.buffer.slice(0));
        pendingOffset = 0;
      }
    }
  };

  // ScriptProcessor requires a destination to stay active in Chrome
  source.connect(processor);
  processor.connect(ctx.destination);

  const stop = () => {
    processor.disconnect();
    source.disconnect();
    mediaStream.getTracks().forEach((t) => t.stop());
    ws.close();
    ctx.close();
    pendingOffset = 0;
  };

  return { stop };
}
