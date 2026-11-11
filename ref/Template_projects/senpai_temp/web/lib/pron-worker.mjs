// The phoneme recognizer, on its own thread. onnxruntime holds the thread it runs
// on for seconds per clip; here that is this worker, not the thread serving
// requests, so Miu's replies and voice keep flowing while an answer is scored.
// Plain JavaScript, loaded by path at runtime (lib/pronounce.ts), so the image ships it as is.
import { setPriority } from "node:os";
import { parentPort, workerData } from "node:worker_threads";

const { dir, modelId, threads, allowed, blank, rate } = workerData;

// On Linux the nice value is per thread: scoring yields the CPU to the request thread.
if (process.platform === "linux") {
  try {
    setPriority(10);
  } catch {}
}

const { env, AutoProcessor, AutoModelForCTC } = await import("@huggingface/transformers");
env.cacheDir = dir;
env.allowRemoteModels = false;
env.localModelPath = dir;
// The arena would keep the largest clip's buffers for the life of the process.
const session_options = { enableCpuMemArena: false, ...(threads ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : {}) };
const [processor, model] = await Promise.all([AutoProcessor.from_pretrained(modelId), AutoModelForCTC.from_pretrained(modelId, { dtype: "q8", session_options })]);

const pauseSecs = workerData.pauseSecs;
async function run(audio) {
  const { logits } = await model(await processor(audio));
  const [, frames, size] = logits.dims;
  const data = logits.data;
  const heard = [];
  const frameSecs = audio.length / rate / frames;
  let prev = -1;
  let run = 0;
  let lead = 0;
  let pauses = 0;
  let spoken = false;
  for (let t = 0; t < frames; t++) {
    const row = t * size;
    let best = blank;
    let score = data[row + blank];
    let out = null;
    for (const a of allowed) {
      if (data[row + a.id] > score) [best, score, out] = [a.id, data[row + a.id], a.out];
    }
    if (best === blank) {
      run++;
    } else {
      if (spoken && run * frameSecs >= pauseSecs) pauses++;
      if (!spoken) lead = run;
      run = 0;
      spoken = true;
      if (best !== prev && out) heard.push(...out);
    }
    prev = best;
  }
  return spoken ? { heard, pauses, lead: lead * frameSecs, tail: run * frameSecs } : { heard, pauses, lead: run * frameSecs, tail: run * frameSecs };
}

parentPort.on("message", async ({ id, audio }) => {
  try {
    parentPort.postMessage({ id, result: await run(audio) });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e?.message ?? e) });
  }
});
parentPort.postMessage({ ready: true });
