"""Inspect the exported NLLB tokenizer.json: what the post-processor adds, and
the ids of the language tokens we need to steer the model."""

import json
import os

DIR = os.path.join(os.environ["LOCALAPPDATA"], "ShiorikoTransNmtTest", "nllb-200-distilled-600M")
with open(os.path.join(DIR, "tokenizer.json"), encoding="utf-8") as handle:
    data = json.load(handle)

print("keys:", sorted(data.keys()))
print("model.type:", data["model"]["type"], "unk_id:", data["model"].get("unk_id"))
print("normalizer:", json.dumps(data.get("normalizer"), ensure_ascii=False)[:400])
print("pre_tokenizer:", json.dumps(data.get("pre_tokenizer"), ensure_ascii=False)[:400])
print("post_processor:", json.dumps(data.get("post_processor"), ensure_ascii=False)[:800])
print("decoder:", json.dumps(data.get("decoder"), ensure_ascii=False)[:300])
print("added_tokens:", len(data.get("added_tokens", [])))
for token in data.get("added_tokens", [])[:6]:
    print("   ", token)

vocab = data["model"]["vocab"]
print("model.vocab size:", len(vocab))
for name in ("zho_Hans", "eng_Latn", "jpn_Jpan", "kor_Hang", "<s>", "</s>", "<pad>"):
    hits = [index for index, entry in enumerate(vocab) if entry[0] == name]
    print(f"vocab {name!r}: {hits[:1]}")
