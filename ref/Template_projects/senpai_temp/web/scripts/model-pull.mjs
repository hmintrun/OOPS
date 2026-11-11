// Downloads the pronunciation model (~300 MB, once) into PRON_MODEL_DIR or data/models.
//   npm run model:pull
// wav2vec2-lv-60-espeak-cv-ft (Apache-2.0), int8 ONNX build from onnx-community.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env, AutoModelForCTC, AutoProcessor } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
const ROOT = new URL("..", import.meta.url).pathname;
const dir = process.env.PRON_MODEL_DIR || path.join(ROOT, "data", "models");

env.cacheDir = dir;
env.localModelPath = dir;
console.log(`Pulling ${MODEL_ID} into ${dir} …`);
await AutoProcessor.from_pretrained(MODEL_ID);
const model = await AutoModelForCTC.from_pretrained(MODEL_ID, { dtype: "q8" });
await model.dispose();
// The repo has no tokenizer.json, so transformers.js doesn't fetch the vocabulary.
const vocab = path.join(dir, MODEL_ID, "vocab.json");
if (!existsSync(vocab)) {
  const res = await fetch(`https://huggingface.co/${MODEL_ID}/resolve/main/vocab.json`);
  if (!res.ok) throw new Error(`vocab.json: HTTP ${res.status}`);
  mkdirSync(path.dirname(vocab), { recursive: true });
  writeFileSync(vocab, await res.text());
}
console.log("Pronunciation model ready.");
