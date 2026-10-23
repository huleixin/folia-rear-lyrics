# jieba data

The dictionary and HMM tables icu-folia's Chinese segmenter runs on, copied verbatim from
[fxsjy/jieba](https://github.com/fxsjy/jieba) at commit `67fa2e36e72f69d9134b8a1037b83fbb070b9775`
(MIT, see `LICENSE`):

| file | upstream path |
|---|---|
| `dict.txt.gz` | `jieba/dict.txt` |
| `prob_start.py`, `prob_trans.py`, `prob_emit.py.gz` | `jieba/finalseg/` |

The two large files are stored as `gzip -9n` (no name or timestamp, so the bytes are reproducible) to
keep a 350k-line text file out of diffs; the plugin gunzips them. sha256 of the decompressed files,
which match upstream byte for byte:

| file | sha256 |
|---|---|
| `dict.txt` | `7197c3211ddd98962b036cdf40324d1ea2bfaa12bd028e68faa70111a88e12a8` |
| `prob_emit.py` | `27d46b1c9efe4dd148fde8be042a21be40e3562d0c7f1273f9de7abae12ebb8d` |

Nothing reads these at runtime. `dev/icuFolia/icuFoliaDataPlugin.mjs` turns them into compact virtual
modules at build time; `src/utils/lyrics/icuFolia/jieba.ts` is the segmenter that uses them.

To update, copy the same files from a newer upstream commit, `gzip -9n dict.txt prob_emit.py`, change
the commit and the sha256 values above, and run the icu-folia tests: the corpus in `test/unit/lyrics/icuFolia/corpus.ts` shows what moved.
