"""
Document parsing for Matter Brief (Phase 1, offline-friendly).

Goal: user uploads an OCR'd PDF (or pasted text) and the system proposes a Brief
that the user can confirm with minimal edits.
"""

from __future__ import annotations

import io
import logging
import re
import shutil
import subprocess
import tempfile
from functools import lru_cache
from dataclasses import dataclass
from typing import Any, Literal

import pdfplumber


CaseType = Literal["civil_rights", "contract", "labor", "torts", "other"]

logging.getLogger("pdfminer").setLevel(logging.ERROR)
logging.getLogger("pdfminer.pdffont").setLevel(logging.ERROR)


def _norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _first_match(patterns: list[str], text: str, flags: int = re.IGNORECASE) -> str | None:
    for p in patterns:
        m = re.search(p, text, flags)
        if m:
            v = m.group(1) if m.groups() else m.group(0)
            v = _norm_space(v)
            if v:
                return v
    return None


def extract_text_from_pdf_bytes(data: bytes, *, max_pages: int = 30) -> str:
    """
    Extract text from PDF bytes. Assumes PDF already has a text layer (OCR'd if needed).
    """
    text, _warnings = extract_text_from_pdf_bytes_with_warnings(data, max_pages=max_pages)
    return text


def normalize_input_text(text: str) -> str:
    """
    Normalize user-supplied text (often Markdown) into parse-friendly plain text.

    Keep line breaks (important for 'Field: value' cues), but strip common Markdown
    decoration like headings, bullets, and code fences.
    """
    t = str(text or "")
    t = t.replace("\r\n", "\n").replace("\r", "\n")

    # Remove fenced code blocks markers but keep content.
    t = re.sub(r"^\s*```[^\n]*\n", "", t, flags=re.MULTILINE)
    t = re.sub(r"^\s*```\s*$", "", t, flags=re.MULTILINE)

    # Strip common Markdown line prefixes (headings, lists, blockquotes).
    t = re.sub(r"^\s{0,3}#{1,6}\s+", "", t, flags=re.MULTILINE)
    t = re.sub(r"^\s{0,3}>\s?", "", t, flags=re.MULTILINE)
    t = re.sub(r"^\s{0,3}[-*+]\s+", "", t, flags=re.MULTILINE)
    t = re.sub(r"^\s{0,3}\d+\.\s+", "", t, flags=re.MULTILINE)

    # Light cleanup.
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{4,}", "\n\n", t)
    return t.strip()


def normalize_extracted_text(text: str) -> str:
    """
    Normalize extracted PDF/OCR text:
    - keep paragraphs/newlines
    - fix hyphenation across line wraps
    - reduce excessive blank lines / trailing spaces
    """
    t = str(text or "")
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    # De-hyphenate common line wrap artifacts: "litiga-\ntion" -> "litigation".
    t = re.sub(r"([A-Za-z])-\n([A-Za-z])", r"\1\2", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{4,}", "\n\n", t)
    return t.strip()


def _extract_text_pdfplumber_with_meta(data: bytes, *, max_pages: int = 30) -> tuple[str, dict[str, Any]]:
    out: list[str] = []
    pages_processed = 0
    total_pages = 0
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        total_pages = len(pdf.pages)
        for page in pdf.pages[: max(1, max_pages)]:
            txt = page.extract_text() or ""
            txt = txt.strip()
            if txt:
                out.append(txt)
            pages_processed += 1
    text = "\n\n".join(out)
    text = normalize_extracted_text(text)
    return (
        text,
        {
            "method": "pdfplumber",
            "pagesProcessed": pages_processed,
            "totalPages": total_pages,
        },
    )


def _extract_text_pdfplumber(data: bytes, *, max_pages: int = 30) -> str:
    text, _meta = _extract_text_pdfplumber_with_meta(data, max_pages=max_pages)
    return text


def _looks_scanned_or_empty(text: str) -> bool:
    t = (text or "").strip()
    if len(t) < 80:
        return True
    # Heuristic: scanned PDFs often yield tiny/junk text; count "meaningful" chars.
    meaningful = len(re.findall(r"[A-Za-z0-9\u4E00-\u9FFF]", t))
    if meaningful >= 80:
        return False
    # If the text is long but has almost no meaningful characters, it's likely junk.
    return len(t) > 500


def _ocrmypdf_available() -> bool:
    return shutil.which("ocrmypdf") is not None


def _tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


@lru_cache(maxsize=1)
def _tesseract_list_langs() -> set[str]:
    try:
        p = subprocess.run(
            ["tesseract", "--list-langs"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
        out = (p.stdout or b"").decode("utf-8", errors="ignore")
        langs: set[str] = set()
        for line in out.splitlines():
            line = line.strip()
            if not line or ":" in line:
                continue
            if re.fullmatch(r"[A-Za-z0-9_]+", line):
                langs.add(line)
        return langs or {"eng"}
    except Exception:
        return {"eng"}


def _choose_tesseract_lang(primary_hint: str) -> tuple[str, str | None]:
    """
    Choose a primary + optional fallback tesseract language string.
    """
    langs = _tesseract_list_langs()
    hint_has_cjk = re.search(r"[\u4E00-\u9FFF]", primary_hint or "") is not None

    has_eng = "eng" in langs
    has_chi_sim = "chi_sim" in langs
    has_chi_tra = "chi_tra" in langs

    if hint_has_cjk and has_chi_sim:
        primary = "eng+chi_sim" if has_eng else "chi_sim"
        fallback = "eng" if has_eng else None
        return primary, fallback
    if hint_has_cjk and has_chi_tra:
        primary = "eng+chi_tra" if has_eng else "chi_tra"
        fallback = "eng" if has_eng else None
        return primary, fallback

    primary = "eng" if has_eng else (sorted(langs)[0] if langs else "eng")
    fallback: str | None = None
    if has_eng and has_chi_sim:
        fallback = "eng+chi_sim"
    return primary, fallback


def _ocr_pdf_bytes_via_ocrmypdf(data: bytes) -> bytes:
    """
    Best-effort OCR fallback using system `ocrmypdf`.

    This keeps the solution offline, but requires local deps:
    - ocrmypdf
    - tesseract (+ language packs as needed)
    - a PDF renderer backend (often poppler/ghostscript depending on platform)
    """
    with tempfile.TemporaryDirectory(prefix="cldemo_ocr_") as td:
        in_path = f"{td}/in.pdf"
        out_path = f"{td}/out.pdf"
        with open(in_path, "wb") as f:
            f.write(data)

        # Keep flags conservative for compatibility across versions.
        cmd = [
            "ocrmypdf",
            "--skip-text",
            "--quiet",
            in_path,
            out_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)

        with open(out_path, "rb") as f:
            return f.read()


def _ocr_pdf_bytes_via_tesseract_images(
    data: bytes,
    *,
    max_pages: int = 10,
    resolution: int = 220,
    lang_hint: str = "",
) -> tuple[str, list[str], dict[str, Any]]:
    """
    OCR fallback without external PDF tools:
    - Render PDF pages to images via pdfplumber (pdfium)
    - Run `tesseract` over the images to extract text
    """
    warnings: list[str] = []
    if not _tesseract_available():
        warnings.append("tesseract is not installed; cannot OCR scanned PDFs offline.")
        return "", warnings, {"ocrMethod": "tesseract", "ocrUsed": False, "ocrLang": None}

    texts: list[str] = []
    page_cap = max(1, min(15, int(max_pages)))
    primary_lang, fallback_lang = _choose_tesseract_lang(lang_hint)

    with tempfile.TemporaryDirectory(prefix="cldemo_tess_") as td:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for i, page in enumerate(pdf.pages[:page_cap], start=1):
                try:
                    img = page.to_image(resolution=resolution, antialias=True).original
                    img_path = f"{td}/p{i:03d}.png"
                    img.save(img_path, format="PNG")

                    def _run(lang: str) -> str:
                        cmd = ["tesseract", img_path, "stdout", "-l", lang]
                        p = subprocess.run(
                            cmd,
                            check=False,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL,
                            timeout=25,
                        )
                        out = (p.stdout or b"").decode("utf-8", errors="ignore")
                        return out.strip()

                    out = _run(primary_lang)
                    if (not out) and fallback_lang:
                        out = _run(fallback_lang)

                    if out:
                        texts.append(out)
                except subprocess.TimeoutExpired:
                    warnings.append(f"tesseract OCR timed out on page {i}; consider a smaller PDF.")
                    break
                except Exception:
                    warnings.append(f"tesseract OCR failed on page {i}.")
                    break

    text = "\n\n".join(texts)
    text = normalize_extracted_text(text)
    return (
        text,
        warnings,
        {"ocrMethod": "tesseract", "ocrUsed": True, "ocrLang": primary_lang, "pagesOcred": page_cap, "resolution": resolution},
    )


def extract_text_from_pdf_bytes_with_warnings(data: bytes, *, max_pages: int = 30) -> tuple[str, list[str]]:
    """
    Extract text from PDF bytes, with an offline OCR fallback for scanned PDFs.

    Returns (text, warnings).
    """
    text, warnings, _meta = extract_text_from_pdf_bytes_with_meta(data, max_pages=max_pages)
    return text, warnings

def extract_text_from_pdf_bytes_with_meta(data: bytes, *, max_pages: int = 30) -> tuple[str, list[str], dict[str, Any]]:
    """
    Extract text from PDF bytes, with an offline OCR fallback for scanned PDFs.

    Returns (text, warnings, meta).
    """
    warnings: list[str] = []
    text, base_meta = _extract_text_pdfplumber_with_meta(data, max_pages=max_pages)
    meta: dict[str, Any] = {**base_meta}
    meta["charsExtracted"] = len(text)
    meta["looksScanned"] = _looks_scanned_or_empty(text)

    if not meta["looksScanned"]:
        if len(text.strip()) < 200:
            warnings.append("Extracted text is short; results may be incomplete (try an OCR'd PDF for best accuracy).")
        return text, warnings, meta

    # OCR fallback
    if not _ocrmypdf_available():
        ocr_text, ocr_warn, ocr_meta = _ocr_pdf_bytes_via_tesseract_images(data, max_pages=min(max_pages, 10), lang_hint=text)
        warnings.extend(ocr_warn)
        meta.update(ocr_meta)

        if not ocr_text.strip():
            warnings.append(
                "PDF text layer appears empty (likely a scanned PDF). Offline OCR did not extract usable text; paste text or install `ocrmypdf` for a stronger offline OCR pipeline."
            )
            return text, warnings, meta

        # Prefer the longer/denser output, but avoid replacing decent text with a worse OCR result.
        if len(ocr_text.strip()) + 20 < len(text.strip()):
            warnings.append("OCR fallback ran, but extracted less text than the original PDF text layer; keeping original.")
            return text, warnings, meta

        warnings.append("Applied offline OCR fallback (tesseract) to extract text.")
        meta["charsExtracted"] = len(ocr_text)
        return ocr_text, warnings, meta

    try:
        ocr_pdf = _ocr_pdf_bytes_via_ocrmypdf(data)
        text2 = _extract_text_pdfplumber(ocr_pdf, max_pages=max_pages)
        if len(text2.strip()) > len(text.strip()):
            warnings.append("Applied offline OCR fallback (ocrmypdf) to extract text.")
            meta["ocrUsed"] = True
            meta["ocrMethod"] = "ocrmypdf"
            meta["charsExtracted"] = len(text2)
            return text2, warnings, meta
        warnings.append("Offline OCR fallback ran, but did not improve extracted text.")
        meta["ocrUsed"] = True
        meta["ocrMethod"] = "ocrmypdf"
        return text, warnings, meta
    except subprocess.TimeoutExpired:
        warnings.append("Offline OCR fallback timed out; try a smaller PDF or pre-OCR the document.")
        return text, warnings, meta
    except Exception:
        warnings.append("Offline OCR fallback failed; try an OCR'd PDF or paste text instead.")
        return text, warnings, meta


def classify_case_type(text: str) -> CaseType:
    t = text.lower()
    scores: dict[CaseType, int] = {"civil_rights": 0, "contract": 0, "labor": 0, "torts": 0, "other": 0}

    def bump(k: CaseType, n: int = 1) -> None:
        scores[k] += n

    # crude keyword scoring (Phase 1)
    if re.search(r"\b(civil rights?|42\s*u\.?s\.?c\.?\s*§?\s*1983|discrimination|equal employment)\b", t):
        bump("civil_rights", 3)
    if re.search(r"\b(contract|breach|agreement|covenant|indemnif)\b", t):
        bump("contract", 3)
    if re.search(r"\b(employment|labor|wage|overtime|fmla|erisa|harassment|wrongful termination)\b", t):
        bump("labor", 3)
    if re.search(r"\b(tort|negligence|product liability|personal injury|defamation)\b", t):
        bump("torts", 3)

    best = max(scores.items(), key=lambda kv: kv[1])[0]
    if scores[best] <= 0:
        return "other"
    return best


def parse_caption(text: str) -> dict[str, Any]:
    """
    Attempt to detect caption 'A v. B' and extract parties.
    """
    # Look for a line with " v. " early in the document.
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    head = "\n".join(lines[:80])
    cap = _first_match([r"([^\n]{2,120}\s+v\.\s+[^\n]{2,120})"], head, flags=re.IGNORECASE)
    if not cap:
        return {"caption": None, "plaintiff": None, "defendant": None}
    parts = re.split(r"\s+v\.\s+", cap, flags=re.IGNORECASE)
    if len(parts) != 2:
        return {"caption": cap, "plaintiff": None, "defendant": None}
    return {"caption": cap, "plaintiff": _norm_space(parts[0]), "defendant": _norm_space(parts[1])}


def parse_court(text: str) -> str | None:
    # Common federal caption header
    head = "\n".join([l.strip() for l in text.splitlines()[:200]])
    district = _first_match(
        [
            r"UNITED STATES DISTRICT COURT\s+(.{0,80}DISTRICT OF\s+[A-Z][A-Z ]{2,80})",
            r"DISTRICT COURT\s+(.{0,80}DISTRICT OF\s+[A-Z][A-Z ]{2,80})",
            r"IN THE\s+UNITED STATES\s+DISTRICT COURT\s+FOR THE\s+([A-Z][A-Z ]{2,80})",
        ],
        head,
        flags=re.IGNORECASE,
    )
    if district:
        d = _norm_space(district)
        # Small, product-friendly abbreviations for common courts (Phase 1).
        if re.search(r"\bNORTHERN\s+DISTRICT\s+OF\s+CALIFORNIA\b", d, flags=re.IGNORECASE):
            return "N.D. Cal."
        return d
    return None


def parse_amount_hint(text: str) -> str | None:
    # Keep it simple: return a compact amount range hint if present.
    # Examples: "$5,000,000", "$5 million", "USD 500,000"
    patterns = [
        r"(\$\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?)",
        r"(\$\s*\d+(?:\.\d+)?\s*(?:million|billion))",
        r"\b(USD\s*\d{1,3}(?:,\d{3})+)\b",
    ]
    return _first_match(patterns, text, flags=re.IGNORECASE)


def parse_role(text: str) -> Literal["plaintiff", "defendant"] | None:
    t = text.lower()
    if re.search(r"\b(client role|we represent|representing)\b.{0,50}\bdefendant\b", t):
        return "defendant"
    if re.search(r"\b(client role|we represent|representing)\b.{0,50}\bplaintiff\b", t):
        return "plaintiff"
    return None


def parse_opponent_counsel(text: str) -> str | None:
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    patterns = [
        r"^(?:opposing counsel|opponent counsel|plaintiff'?s counsel|defendant'?s counsel|outside counsel)\s*[:\-]\s*(.+)$",
    ]
    for line in lines[:250]:
        for p in patterns:
            m = re.match(p, line, flags=re.IGNORECASE)
            if m:
                v = _norm_space(m.group(1))
                if v:
                    return v[:160]
    return None


def parse_budget_usd(text: str) -> int | None:
    """
    Extract a user-provided budget line. We intentionally require a 'budget' cue
    to avoid confusing damages amounts with budget.
    """
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    patterns = [
        r"^(?:estimated\s+)?(?:litigation\s+)?budget.*?(?:\(?\s*(?:usd|\$)\s*\)?)\s*[:\-]?\s*\$?\s*([0-9][0-9,]{2,})\b",
        r"^(?:budget)\s*(?:\(?\s*(?:usd|\$)\s*\)?)\s*[:\-]?\s*\$?\s*([0-9][0-9,]{2,})\b",
    ]
    for line in lines[:250]:
        for p in patterns:
            m = re.match(p, line, flags=re.IGNORECASE)
            if not m:
                continue
            raw = re.sub(r"[,\s]", "", m.group(1))
            try:
                v = int(raw)
            except Exception:
                continue
            if v < 0:
                continue
            return v
    return None


def parse_notes(text: str) -> str | None:
    lines = [l.rstrip() for l in (text or "").splitlines()]
    for i, line in enumerate(lines[:300]):
        if re.match(r"^\s*notes?\s*:\s*", line, flags=re.IGNORECASE):
            v = re.sub(r"^\s*notes?\s*:\s*", "", line, flags=re.IGNORECASE).strip()
            extra: list[str] = []
            for nxt in lines[i + 1 : i + 4]:
                if not nxt.strip():
                    break
                extra.append(nxt.strip())
            out = _norm_space(" ".join([v] + extra))
            if out:
                return out[:400]
    return None


@dataclass(frozen=True)
class ParsedBrief:
    brief: dict[str, Any]
    fields: list[dict[str, Any]]
    warnings: list[str]


def parse_text_to_brief(text: str) -> ParsedBrief:
    raw = str(text or "")
    normalized = normalize_input_text(raw)
    clean = _norm_space(normalized)
    warnings: list[str] = []

    caption = parse_caption(normalized)
    court = parse_court(normalized)
    amount = parse_amount_hint(normalized)
    case_type = classify_case_type(normalized)
    role = parse_role(normalized)
    opponent_counsel = parse_opponent_counsel(normalized)
    budget_usd = parse_budget_usd(normalized)
    notes = parse_notes(normalized)

    opponent_name: str | None = None
    if role and caption.get("plaintiff") and caption.get("defendant"):
        opponent_name = caption["plaintiff"] if role == "defendant" else caption["defendant"]

    fields: list[dict[str, Any]] = []
    if caption.get("caption"):
        fields.append({"key": "caption", "value": caption["caption"], "confidence": "medium"})
    if court:
        fields.append({"key": "court", "value": court, "confidence": "medium"})
    if amount:
        fields.append({"key": "amountHint", "value": amount, "confidence": "low"})
    if case_type:
        fields.append({"key": "caseType", "value": case_type, "confidence": "low"})
    if role:
        fields.append({"key": "role", "value": role, "confidence": "medium"})
    if opponent_name:
        fields.append({"key": "opponentName", "value": opponent_name, "confidence": "medium"})
    if opponent_counsel:
        fields.append({"key": "opponentCounsel", "value": opponent_counsel, "confidence": "medium"})
    if isinstance(budget_usd, int):
        fields.append({"key": "budgetUsd", "value": budget_usd, "confidence": "medium"})

    brief = {
        "jurisdiction": "US",
        "court": court,
        "judge": None,
        "caseType": case_type,
        "role": role,
        "opponentName": opponent_name,
        "opponentCounsel": opponent_counsel,
        "notes": notes,
        "constraints": {"budgetUsd": budget_usd, "preferredFirms": [], "excludedFirms": [], "geo": [], "panelOnly": False},
        "extracted": {
            "caption": caption.get("caption"),
            "plaintiff": caption.get("plaintiff"),
            "defendant": caption.get("defendant"),
            "amountHint": amount,
        },
    }

    if not clean:
        warnings.append("No text extracted from document; ensure the PDF is OCR'd or provide text.")

    return ParsedBrief(brief=brief, fields=fields, warnings=warnings)
