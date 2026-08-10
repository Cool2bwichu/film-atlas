"""Importable alias for build-index.py, whose hyphen makes it un-importable.

Nothing here changes that file — it is loaded from disk exactly as it sits, so
the ablation runs the same blob builder and the same chunker the real index used.
"""
import importlib.util, os, sys

_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-index.py")
_spec = importlib.util.spec_from_file_location("build_index_impl", _p)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["build_index_impl"] = _mod
_spec.loader.exec_module(_mod)

globals().update({k: v for k, v in vars(_mod).items() if not k.startswith("__")})
