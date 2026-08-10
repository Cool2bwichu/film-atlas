"""
embed.py — sentence embeddings for the ATLAS RAG bake-off.

Model:      sentence-transformers/all-MiniLM-L6-v2, ONNX export (fp32)
Runtime:    onnxruntime CPU only. No torch, no sentence_transformers, no faiss.
Dimension:  384, L2-normalised, so cosine == dot product.
Pooling:    mean over non-pad tokens, then L2 normalise. This is exactly what
            sentence-transformers does (modules.json: Transformer -> Pooling
            (pooling_mode_mean_tokens) -> Normalize). The ONNX graph only emits
            last_hidden_state, so pooling and normalisation happen here.

IMPORTANT — the 256 token ceiling:
    sentence_bert_config.json sets max_seq_length = 256 WORDPIECES. The BERT
    graph would accept 512, but the published sentence encoder was trained and
    is evaluated at 256, so that is the faithful setting and it is the default
    here. The article this trial reproduces asks for 512-token chunks; at 256
    the back half of every such chunk is silently dropped. Pass
    max_seq_length=512 if you want to reproduce the article's stated number,
    but know that you are then running the encoder out of distribution.
    chunk_text() below counts real wordpieces, so the honest way to honour the
    article is chunk_tokens=256.

USAGE (python, in-process — the normal case):

    import sys; sys.path.insert(0, "/home/user/film-atlas/atlas/pipeline/rag")
    from embed import Embedder

    emb = Embedder()                      # ~0.4 s to load
    V = emb.encode(["a sentence", "another"])   # -> np.ndarray (2, 384) float32
    sim = V @ V.T                         # cosine, because rows are unit length

    Embedder(max_seq_length=256, batch_size=32, threads=None, model_dir=None)
    emb.encode(texts, batch_size=None, show_progress=False) -> (n, 384) float32
    emb.dim                               # 384

USAGE (CLI — for Node or any other language):

    # newline-delimited text in, .npy matrix out
    python3 atlas/pipeline/rag/embed.py --in texts.txt --out vecs.npy

    # JSON array of strings in, JSON array of arrays out (slower, human readable)
    python3 atlas/pipeline/rag/embed.py --in texts.json --out vecs.json --json

    # prove the thing works
    python3 atlas/pipeline/rag/embed.py --selftest
    python3 atlas/pipeline/rag/embed.py --bench /home/user/film-atlas/atlas/pipeline/out/plots.json

Reading the .npy back:  numpy.load("vecs.npy")  -> (n, 384) float32, row i is line i.

Determinism: onnxruntime CPU with a fixed graph is deterministic run to run.
Row order always matches input order (internally we sort by length for speed
and then unsort, so batching never permutes your output).
"""

from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

DEFAULT_MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".cache-rag",
    "minilm",
)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2 (onnx fp32)"
DIM = 384
MAX_SEQ_LENGTH = 256  # sentence_bert_config.json, NOT the 512 the BERT graph allows


class Embedder:
    """all-MiniLM-L6-v2 over onnxruntime. Rows come back L2-normalised."""

    def __init__(
        self,
        model_dir: str | None = None,
        max_seq_length: int = MAX_SEQ_LENGTH,
        batch_size: int = 32,
        threads: int | None = None,
    ):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.model_dir = model_dir or DEFAULT_MODEL_DIR
        model_path = os.path.join(self.model_dir, "model.onnx")
        tok_path = os.path.join(self.model_dir, "tokenizer.json")
        for p in (model_path, tok_path):
            if not os.path.exists(p):
                raise FileNotFoundError(
                    f"missing {p}. Fetch the model with:\n"
                    f"  mkdir -p {self.model_dir} && cd {self.model_dir} && \\\n"
                    f"  curl -sSLO https://huggingface.co/sentence-transformers/"
                    f"all-MiniLM-L6-v2/resolve/main/tokenizer.json && \\\n"
                    f"  curl -sSL -o model.onnx https://huggingface.co/"
                    f"sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx"
                )

        self.max_seq_length = int(max_seq_length)
        self.batch_size = int(batch_size)
        self.dim = DIM
        self.model_name = MODEL_NAME

        self.tokenizer = Tokenizer.from_file(tok_path)
        self.tokenizer.no_padding()
        self.tokenizer.enable_truncation(max_length=self.max_seq_length)

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if threads:
            opts.intra_op_num_threads = int(threads)
        self.session = ort.InferenceSession(
            model_path, sess_options=opts, providers=["CPUExecutionProvider"]
        )
        self._input_names = {i.name for i in self.session.get_inputs()}

    # -- tokenisation ----------------------------------------------------

    def token_count(self, text: str) -> int:
        """Wordpieces including [CLS]/[SEP], before truncation."""
        self.tokenizer.no_truncation()
        try:
            return len(self.tokenizer.encode(text).ids)
        finally:
            self.tokenizer.enable_truncation(max_length=self.max_seq_length)

    def _encode_batch(self, texts: list[str]) -> np.ndarray:
        encs = self.tokenizer.encode_batch(texts)
        width = max((len(e.ids) for e in encs), default=1) or 1
        n = len(encs)
        ids = np.zeros((n, width), dtype=np.int64)
        mask = np.zeros((n, width), dtype=np.int64)
        types = np.zeros((n, width), dtype=np.int64)
        for i, e in enumerate(encs):
            k = len(e.ids)
            if k:
                ids[i, :k] = e.ids
                mask[i, :k] = e.attention_mask
                types[i, :k] = e.type_ids

        feed = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in self._input_names:
            feed["token_type_ids"] = types

        hidden = self.session.run(None, feed)[0]  # (n, width, 384)

        # mean pool over real tokens only
        m = mask.astype(np.float32)[:, :, None]
        summed = (hidden * m).sum(axis=1)
        counts = np.clip(m.sum(axis=1), 1e-9, None)
        vecs = summed / counts

        # L2 normalise
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        return (vecs / np.clip(norms, 1e-12, None)).astype(np.float32)

    # -- public ----------------------------------------------------------

    def encode(
        self,
        texts,
        batch_size: int | None = None,
        show_progress: bool = False,
    ) -> np.ndarray:
        """Embed a list of strings. Returns (len(texts), 384) float32, unit rows,
        in the SAME ORDER as the input."""
        if isinstance(texts, str):
            texts = [texts]
        texts = [("" if t is None else str(t)) for t in texts]
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)

        bs = int(batch_size or self.batch_size)
        # sort long-to-short so each padded batch wastes as little as possible,
        # then put the rows back where they came from
        order = sorted(range(len(texts)), key=lambda i: -len(texts[i]))
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        t0 = time.time()
        for start in range(0, len(order), bs):
            idx = order[start : start + bs]
            out[idx] = self._encode_batch([texts[i] for i in idx])
            if show_progress:
                done = min(start + bs, len(order))
                rate = done / max(time.time() - t0, 1e-9)
                print(
                    f"\r  embed {done}/{len(order)}  {rate:.1f}/s",
                    end="",
                    file=sys.stderr,
                    flush=True,
                )
        if show_progress:
            print(f"  ({time.time() - t0:.1f}s)", file=sys.stderr)
        return out

    def chunk_text(
        self, text: str, chunk_tokens: int = 256, overlap_tokens: int = 30
    ) -> list[str]:
        """RecursiveCharacterTextSplitter-equivalent, but measuring real
        wordpieces instead of characters. Splits on paragraph, then line, then
        sentence, then space, and only mid-word as a last resort. Returns the
        chunk strings; embed them with encode() like any other text.

        The article asks for chunk_tokens=512 / overlap_tokens=30. Anything over
        256 gets truncated by the encoder, so 256 is the honest ceiling."""
        text = (text or "").strip()
        if not text:
            return []
        if self.token_count(text) <= chunk_tokens:
            return [text]

        # Budget for the overlap up front. Every chunk after the first gets the
        # tail of its predecessor prepended, so the body must be built at
        # chunk_tokens - overlap_tokens or the joined chunk overflows the
        # encoder and the tail we just added is what gets truncated away.
        body_tokens = max(16, chunk_tokens - max(0, overlap_tokens))

        seps = ["\n\n", "\n", ". ", " "]

        def split(s: str, depth: int) -> list[str]:
            if self.token_count(s) <= body_tokens:
                return [s] if s.strip() else []
            if depth >= len(seps):
                # hard cut on wordpieces
                self.tokenizer.no_truncation()
                ids = self.tokenizer.encode(s).ids
                self.tokenizer.enable_truncation(max_length=self.max_seq_length)
                parts = []
                for i in range(0, len(ids), body_tokens):
                    parts.append(self.tokenizer.decode(ids[i : i + body_tokens]))
                return [p for p in parts if p.strip()]
            sep = seps[depth]
            pieces = s.split(sep)
            out, buf = [], ""
            for piece in pieces:
                cand = (buf + sep + piece) if buf else piece
                if self.token_count(cand) <= body_tokens:
                    buf = cand
                else:
                    if buf:
                        out.append(buf)
                    if self.token_count(piece) > body_tokens:
                        out.extend(split(piece, depth + 1))
                        buf = ""
                    else:
                        buf = piece
            if buf.strip():
                out.append(buf)
            return out

        chunks = split(text, 0)
        if overlap_tokens <= 0 or len(chunks) < 2:
            return chunks

        # bolt the tail of chunk i-1 onto the head of chunk i
        joined = [chunks[0]]
        for prev, cur in zip(chunks, chunks[1:]):
            words = prev.split()
            tail = ""
            for k in range(1, len(words) + 1):
                cand = " ".join(words[-k:])
                if self.token_count(cand) > overlap_tokens:
                    break
                tail = cand
            joined.append((tail + " " + cur).strip() if tail else cur)
        return joined


_SHARED: Embedder | None = None


def get_embedder(**kw) -> Embedder:
    """Process-wide singleton, so repeated calls don't reload 90 MB of weights."""
    global _SHARED
    if _SHARED is None or kw:
        e = Embedder(**kw)
        if not kw:
            _SHARED = e
        return e
    return _SHARED


def encode(texts, **kw) -> np.ndarray:
    """One-liner: from embed import encode; V = encode([...])"""
    return get_embedder().encode(texts, **kw)


# -- CLI -----------------------------------------------------------------

SELFTEST_SENTENCES = [
    "A lonely detective hunts a serial killer through rainy city streets.",   # 0
    "A solitary investigator pursues a murderer across a rain-soaked city.",  # 1  paraphrase of 0
    "Two old friends in a small village stop speaking to each other.",        # 2
    "A programmer is invited to test whether an android is conscious.",       # 3
    "The recipe calls for three cups of flour and a pinch of salt.",          # 4  unrelated
]


def _selftest() -> int:
    print(f"model      {MODEL_NAME}")
    t0 = time.time()
    emb = Embedder()
    load = time.time() - t0
    print(f"dim        {emb.dim}")
    print(f"max_seq    {emb.max_seq_length} wordpieces")
    print(f"load       {load:.2f}s")

    V = emb.encode(SELFTEST_SENTENCES)
    print(f"shape      {V.shape} {V.dtype}")
    norms = np.linalg.norm(V, axis=1)
    print(f"row norms  min {norms.min():.6f} max {norms.max():.6f}  (must be 1.0)")

    S = V @ V.T
    print("\npairwise cosine")
    print("      " + "".join(f"{i:>8}" for i in range(len(V))))
    for i, row in enumerate(S):
        print(f"  {i}  " + "".join(f"{v:8.3f}" for v in row))

    para = float(S[0, 1])
    unrel = float(S[0, 4])
    print("\n  [0]x[1] paraphrase   %.3f" % para)
    print("  [0]x[4] unrelated    %.3f" % unrel)
    ok = para > unrel and para > 0.5 and norms.min() > 0.999
    print("\nRESULT: %s (paraphrase %.3f %s unrelated %.3f)" % (
        "PASS" if ok else "FAIL", para, ">" if para > unrel else "<=", unrel))
    return 0 if ok else 1


def _bench(plots_path: str, n: int = 100) -> int:
    with open(plots_path) as fh:
        blob = json.load(fh)
    films = blob.get("films", blob)
    texts = []
    for rec in films.values():
        p = (rec or {}).get("plot")
        if p:
            texts.append(p)
        if len(texts) >= n:
            break
    print(f"bench      {len(texts)} plot texts from {plots_path}")
    chars = [len(t) for t in texts]
    print(f"chars      mean {int(np.mean(chars))} median {int(np.median(chars))} max {max(chars)}")

    emb = Embedder()
    emb.encode(texts[:4])  # warm the graph
    t0 = time.time()
    V = emb.encode(texts, show_progress=True)
    dt = time.time() - t0
    print(f"embedded   {V.shape} in {dt:.2f}s  ({len(texts)/dt:.1f} texts/s)")
    print(f"projected  2204 films -> {2204*dt/len(texts):.1f}s single pass, truncated at "
          f"{emb.max_seq_length} wordpieces")
    tc = [emb.token_count(t) for t in texts[:40]]
    over = sum(1 for c in tc if c > emb.max_seq_length)
    print(f"truncation {over}/40 sampled plots exceed {emb.max_seq_length} wordpieces "
          f"(median {int(np.median(tc))} tokens)")
    return 0


def main(argv: list[str]) -> int:
    args = argv[1:]
    if not args or "--help" in args or "-h" in args:
        print(__doc__)
        return 0
    if "--selftest" in args:
        return _selftest()
    if "--bench" in args:
        i = args.index("--bench")
        path = args[i + 1] if len(args) > i + 1 else os.path.join(
            os.path.dirname(DEFAULT_MODEL_DIR), "out", "plots.json")
        return _bench(path)

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args else default

    src, dst = opt("--in"), opt("--out")
    if not src or not dst:
        print("need --in PATH --out PATH (or --selftest / --bench)", file=sys.stderr)
        return 2
    as_json = "--json" in args or src.endswith(".json")

    raw = open(src).read()
    texts = json.loads(raw) if as_json else [l for l in raw.split("\n") if l != ""]
    if isinstance(texts, dict):
        texts = list(texts.values())

    emb = Embedder(max_seq_length=int(opt("--max-seq", MAX_SEQ_LENGTH)))
    V = emb.encode(texts, batch_size=int(opt("--batch", 32)), show_progress=True)
    if dst.endswith(".npy"):
        np.save(dst, V)
    else:
        with open(dst, "w") as fh:
            json.dump([[round(float(x), 6) for x in row] for row in V], fh)
    print(f"wrote {dst}  {V.shape}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
