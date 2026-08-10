#!/usr/bin/env python3
"""static_embed.py — the encoder as a lookup table.

Route 1 of the RAG bake-off's "what would it take to ship this". MiniLM answers
a typed sentence in 384 dimensions and costs 87 MB of transformer to do it; that
is fifty times the whole atlas and it is why dense retrieval could not ship.

A model2vec static model is the same idea with the network taken out: every
wordpiece has ONE vector, decided at distillation time, and a sentence is those
vectors averaged. No attention, no layers, no context — a dictionary and some
arithmetic. It runs in microseconds and it ports to JavaScript in about forty
lines, which is the whole point.

What it costs is context: "not violent" and "violent" average to nearly the same
place, and so do "a bank robbery" and "robbery at a bank". MiniLM is not much
better at the first (measured: cosine 0.978 between a sentence and its own
negation) but it is genuinely better at the second. Whether that difference
matters for FILM SEARCH is the thing this file exists to measure rather than
assume.
"""
import json, struct, sys, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = "/tmp/claude-0/-home-user-film-atlas/3a394c7e-a9b1-54c8-925e-faea85bfde9d/scratchpad/potion"

def load_safetensors(path):
    """The format is a JSON header then raw little-endian tensor bytes. Parsed
    here rather than pulled in as a dependency: it is nine lines and the build
    should not grow a package for nine lines."""
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        hdr = json.loads(f.read(n))
        blob = f.read()
    out = {}
    for k, meta in hdr.items():
        if k == "__metadata__":
            continue
        a, b = meta["data_offsets"]
        dt = {"F32": np.float32, "F16": np.float16, "I8": np.int8}[meta["dtype"]]
        out[k] = np.frombuffer(blob[a:b], dtype=dt).reshape(meta["shape"])
    return out

class StaticEmbedder:
    def __init__(self, model_dir=DEFAULT):
        from tokenizers import Tokenizer
        self.tok = Tokenizer.from_file(os.path.join(model_dir, "tokenizer.json"))
        cfg = json.load(open(os.path.join(model_dir, "config.json")))
        tensors = load_safetensors(os.path.join(model_dir, "model.safetensors"))
        key = next(k for k in tensors if "embed" in k.lower() or tensors[k].ndim == 2)
        self.W = np.asarray(tensors[key], dtype=np.float32)
        self.dim = self.W.shape[1]
        self.normalize = bool(cfg.get("normalize", True))
        self.vocab_size = self.W.shape[0]

    def encode(self, texts, batch_size=None):
        """Mean-pool the rows of every token present. The distillation already
        folded zipf weighting into the vectors themselves (config apply_zipf),
        so this must NOT re-weight — doing so double-counts frequency and was
        the first thing I got wrong here."""
        if isinstance(texts, str):
            texts = [texts]
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        encs = self.tok.encode_batch([t if t else " " for t in texts])
        for i, e in enumerate(encs):
            ids = [j for j in e.ids if 0 <= j < self.vocab_size]
            if not ids:
                continue
            out[i] = self.W[ids].mean(axis=0)
        if self.normalize:
            n = np.linalg.norm(out, axis=1, keepdims=True)
            out = out / np.maximum(n, 1e-12)
        return out

_singleton = None
def get_embedder(model_dir=DEFAULT):
    global _singleton
    if _singleton is None:
        _singleton = StaticEmbedder(model_dir)
    return _singleton

def encode(texts, model_dir=DEFAULT):
    return get_embedder(model_dir).encode(texts)

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        E = StaticEmbedder()
        print(f"dim {E.dim}  vocab {E.vocab_size}  normalize {E.normalize}")
        pairs = [
            ("A lonely detective hunts a serial killer through rainy city streets",
             "A solitary investigator pursues a murderer across a rain-soaked city", "paraphrase"),
            ("A lonely detective hunts a serial killer through rainy city streets",
             "Combine the flour and salt, then rest the dough for an hour", "unrelated"),
            ("a violent film", "a film that is not violent", "negation"),
        ]
        for a, b, label in pairs:
            V = E.encode([a, b])
            print(f"  {label:11} cos {float(V[0] @ V[1]):+.4f}")
        V = E.encode(["hello world"] * 3)
        print("  determinism", "PASS" if np.allclose(V[0], V[2]) else "FAIL")
        print("  row norms", f"{np.linalg.norm(V,axis=1).min():.6f}")
