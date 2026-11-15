"""Question fingerprinting and duplicate detection for the Question Bank.

Every question gets two stored hashes (``questions.fingerprint`` / ``questions.simhash``):

* ``fingerprint`` - SHA-256 of the normalised text (lower-case, punctuation/spacing stripped). Exact and
  re-formatted repeats are caught with one set lookup.
* ``simhash`` - 64-bit SimHash over word uni+bi-grams. Near-identical wording lands within a few bits.

Paraphrases that change several words are caught by ``QuestionIndex``: an in-memory inverted index of
stemmed content words (candidate lookup, so a check does not scan the whole bank) followed by Jaccard /
containment scoring. The same index also answers "what does the bank already cover for this topic?" so the
generator prompt can show the model the relevant existing questions instead of an arbitrary recent slice.

Rows saved before this module existed (or by the Next.js twin, which does not write the columns) have NULL
hashes; ``QuestionIndex.load`` computes and stores them lazily.

Twin: frontend/fe-apis/dailySession/dedup.ts (nextjs-api mode) must produce the same hashes and verdicts.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Set, Tuple


_STOPWORDS = {
    "the", "a", "an", "of", "to", "and", "in", "on", "for", "is", "are", "was", "were", "be", "been", "by", "or",
    "how", "do", "does", "did", "you", "your", "would", "what", "why", "with", "that", "this", "it", "its", "as",
    "when", "from", "at", "can", "could", "should", "will", "which", "who", "about", "into", "than", "then",
    "they", "their", "them", "there", "where", "while", "if", "so", "we", "our", "me", "my", "i", "tell", "explain",
    "describe", "design", "walk", "through", "between", "using", "use", "used", "need", "needs", "not", "no",
    "has", "have", "had", "per", "each", "any", "all", "more", "most", "some", "such", "also", "both", "one",
}

_SUFFIXES = ("ization", "ations", "ation", "ingly", "ments", "ment", "ings", "ing", "ies", "ied", "ers", "er",
             "ed", "es", "ly", "s")


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", (text or "").lower()))


def _stem(word: str) -> str:
    for suf in _SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            return word[: -len(suf)] + ("y" if suf in ("ies", "ied") else "")
    return word


def content_stems(text: str) -> Set[str]:
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if w not in _STOPWORDS and len(w) > 1}


def fingerprint(text: str) -> str:
    return hashlib.sha256(normalize(text).encode("utf-8")).hexdigest()[:32]


def simhash(text: str) -> int:
    words = [w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if w not in _STOPWORDS]
    feats = words + [f"{a} {b}" for a, b in zip(words, words[1:])]
    if not feats:
        return 0
    acc = [0] * 64
    for f in feats:
        h = int.from_bytes(hashlib.md5(f.encode("utf-8")).digest()[:8], "big")
        for bit in range(64):
            acc[bit] += 1 if (h >> bit) & 1 else -1
    out = 0
    for bit in range(64):
        if acc[bit] > 0:
            out |= 1 << bit
    return out


def _to_signed(v: int) -> int:
    """SQLite INTEGER is signed 64-bit."""
    return v - (1 << 64) if v >= (1 << 63) else v


def _to_unsigned(v: int) -> int:
    return v + (1 << 64) if v < 0 else v


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


class QuestionIndex:
    """In-memory view of the Question Bank (plus anything added during a generation run)."""

    # Tuned on paraphrase pairs: 0.5 Jaccard of stemmed content words, or one question almost fully
    # contained in a longer one, or a SimHash within 4 bits with at least some shared vocabulary.
    JACCARD_THRESHOLD = 0.5
    CONTAINMENT_THRESHOLD = 0.8
    SIMHASH_BITS = 4

    def __init__(self) -> None:
        self.texts: List[str] = []
        self._stems: List[Set[str]] = []
        self._sims: List[int] = []
        self._fps: Set[str] = set()
        self._inv: Dict[str, List[int]] = defaultdict(list)

    # ---- loading -------------------------------------------------------------------------------------
    @classmethod
    def load(cls, db_path: Optional[str] = None) -> "QuestionIndex":
        from modules.common.db import get_db_path  # lazy: db.py imports this module

        idx = cls()
        conn = sqlite3.connect(db_path or get_db_path())
        try:
            cur = conn.cursor()
            cols = [r[1] for r in cur.execute("PRAGMA table_info(questions)").fetchall()]
            has_hash = "fingerprint" in cols and "simhash" in cols
            if has_hash:
                rows = cur.execute("SELECT id, question_text, fingerprint, simhash FROM questions ORDER BY id").fetchall()
            else:
                rows = [(i, t, None, None) for i, t in cur.execute("SELECT id, question_text FROM questions ORDER BY id").fetchall()]
            backfill: List[Tuple[str, int, int]] = []
            seen_fp: Set[str] = set()
            for qid, text, fp, sim in rows:
                if not text:
                    continue
                if fp is None or sim is None:
                    fp, sim = fingerprint(text), _to_signed(simhash(text))
                    backfill.append((fp, sim, qid))
                # one entry per distinct question: exact repeats in the bank add nothing to the index
                if fp in seen_fp:
                    continue
                seen_fp.add(fp)
                idx._add(text, fp, _to_unsigned(sim))
            if has_hash and backfill:
                try:
                    cur.executemany("UPDATE questions SET fingerprint = ?, simhash = ? WHERE id = ?", backfill)
                    conn.commit()
                except sqlite3.OperationalError:
                    pass  # another writer holds the DB; the hashes are recomputed on the next load
        finally:
            conn.close()
        return idx

    def _add(self, text: str, fp: str, sim: int) -> None:
        pos = len(self.texts)
        stems = content_stems(text)
        self.texts.append(text)
        self._stems.append(stems)
        self._sims.append(sim)
        self._fps.add(fp)
        for s in stems:
            self._inv[s].append(pos)

    def add(self, text: str) -> None:
        self._add(text, fingerprint(text), simhash(text))

    def __len__(self) -> int:
        return len(self.texts)

    # ---- duplicate check -----------------------------------------------------------------------------
    def find_duplicate(self, text: str) -> Optional[Tuple[str, str]]:
        """Return (reason, matching existing question) or None if the text is new."""
        if fingerprint(text) in self._fps:
            return "exact", text
        stems = content_stems(text)
        if not stems:
            return None
        sim = simhash(text)
        # candidates: any existing question sharing at least 2 content words (or 1 if the text is tiny)
        hits: Dict[int, int] = defaultdict(int)
        for s in stems:
            for pos in self._inv.get(s, ()):
                hits[pos] += 1
        need = 2 if len(stems) >= 3 else 1
        for pos, shared in hits.items():
            if shared < need:
                continue
            other = self._stems[pos]
            union = len(stems | other)
            jac = shared / union if union else 0.0
            small = min(len(stems), len(other))
            if jac >= self.JACCARD_THRESHOLD:
                return "paraphrase", self.texts[pos]
            if small >= 4 and shared / small >= self.CONTAINMENT_THRESHOLD:
                return "contained", self.texts[pos]
            if jac >= 0.3 and hamming(sim, self._sims[pos]) <= self.SIMHASH_BITS:
                return "near-hash", self.texts[pos]
        return None

    def is_duplicate(self, text: str) -> bool:
        return self.find_duplicate(text) is not None

    # ---- retrieval for the generator prompt ----------------------------------------------------------
    def related(self, query: str, k: int = 25) -> List[str]:
        """The k existing questions that share the most content words with ``query`` (ties: newest first)."""
        q = content_stems(query)
        if not q:
            return []
        score: Dict[int, int] = defaultdict(int)
        for s in q:
            for pos in self._inv.get(s, ()):
                score[pos] += 1
        ranked = sorted(score.items(), key=lambda kv: (-kv[1], -kv[0]))
        return [self.texts[pos] for pos, _ in ranked[:k]]

    def coverage(self, phrase: str) -> int:
        """How many bank questions touch every content word of ``phrase`` - lower means less-explored ground."""
        q = content_stems(phrase)
        if not q:
            return 0
        sets = [set(self._inv.get(s, ())) for s in q]
        return len(set.intersection(*sets)) if sets else 0


def backfill_hashes(conn: sqlite3.Connection) -> int:
    """Fill fingerprint/simhash for rows that lack them. Used by init_db; returns rows updated."""
    cur = conn.cursor()
    rows = cur.execute("SELECT id, question_text FROM questions WHERE fingerprint IS NULL OR simhash IS NULL").fetchall()
    cur.executemany(
        "UPDATE questions SET fingerprint = ?, simhash = ? WHERE id = ?",
        [(fingerprint(t or ""), _to_signed(simhash(t or "")), i) for i, t in rows],
    )
    return len(rows)


def hashes_for(text: str) -> Tuple[str, int]:
    """(fingerprint, signed simhash) ready to store in the questions table."""
    return fingerprint(text), _to_signed(simhash(text))


def hashes_iter(texts: Iterable[str]) -> List[Tuple[str, int]]:
    return [hashes_for(t) for t in texts]
