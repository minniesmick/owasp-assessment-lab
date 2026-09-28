"""Check that findings, evidence and progress files follow the project conventions.

Run locally before pushing:
    python scripts/validate.py

The same script runs on every push / pull request (.github/workflows/validate.yml).
Exit code 1 = errors (must fix). Warnings do not fail the check.
Only Python standard library is used.
"""
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_FILE_MB = 5

SOURCES = {"juice-shop": "JS", "portswigger": "PS"}
OWASP_CODES = {f"A{i:02d}" for i in range(1, 11)}
SEVERITIES = {"critical", "high", "medium", "low", "info"}
STATUSES = {"draft", "confirmed", "reviewed"}
# CVSS 3.1 qualitative rating scale
SEVERITY_RANGES = {
    "critical": (9.0, 10.0),
    "high": (7.0, 8.9),
    "medium": (4.0, 6.9),
    "low": (0.1, 3.9),
    "info": (0.0, 0.0),
}
REQUIRED_FIELDS = [
    "id", "title", "source", "target", "owasp", "cwe", "severity",
    "cvss_vector", "cvss_score", "tester", "date", "status", "evidence",
]
PLACEHOLDERS = {"name-surname", "_fill in_", ""}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
FINDING_NAME = re.compile(r"^(JS|PS)-(A(?:0[1-9]|10))-(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
EVIDENCE_NAME = re.compile(r"^((?:JS|PS)-A(?:0[1-9]|10)-\d{3})-\d+\.(png|jpe?g|gif|webp)$")
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__"}

errors = []
warnings = []
IN_CI = os.environ.get("GITHUB_ACTIONS") == "true"


def rel(path):
    return path.relative_to(ROOT).as_posix()


def error(path, msg):
    errors.append((rel(path), msg))


def warn(path, msg):
    warnings.append((rel(path), msg))


def parse_front_matter(text):
    """Minimal parser for our flat YAML front matter: `key: value` and `key:` + `  - item` lists."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, text
    try:
        end = next(i for i, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration:
        return None, text
    data, current_list = {}, None
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s*(.*)$", line)
        if item and current_list is not None:
            data[current_list].append(clean_value(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z_][\w]*)\s*:\s*(.*)$", line)
        if not kv:
            continue
        key, value = kv.group(1), clean_value(kv.group(2))
        if value == "":
            data[key], current_list = [], key
        else:
            data[key], current_list = value, None
    return data, "\n".join(lines[end + 1:])


def clean_value(value):
    value = value.strip()
    if value[:1] in {'"', "'"}:
        quote = value[0]
        closing = value.find(quote, 1)
        return value[1:closing] if closing > 0 else value[1:]
    return re.sub(r"\s+#.*$", "", value).strip()


def check_finding(path, source_dir, seen_ids):
    m = FINDING_NAME.match(path.name)
    if not m:
        error(path, "Dosya adi formati yanlis. Ornek: JS-A05-001-login-sqli.md "
                    "(JS/PS + OWASP kodu + 3 haneli numara + kucuk harfli-kisa-aciklama)")
        return
    prefix, owasp_from_name, _ = m.groups()
    expected_prefix = SOURCES[source_dir]
    if prefix != expected_prefix:
        error(path, f"'{prefix}-' dosyasi yanlis klasorde. {prefix}- dosyalari "
                    f"findings/{'juice-shop' if prefix == 'JS' else 'portswigger'}/ icine konmali")

    text = path.read_text(encoding="utf-8")
    fm, body = parse_front_matter(text)
    if fm is None:
        error(path, "Dosyanin basinda --- ile baslayan YAML alani yok. findings/_TEMPLATE.md'yi kopyalayin")
        return

    for field in REQUIRED_FIELDS:
        if field not in fm:
            error(path, f"Zorunlu alan eksik: '{field}'")
    file_id = path.name[:10]  # e.g. JS-A05-001

    fid = fm.get("id")
    if isinstance(fid, str) and fid:
        if fid != file_id:
            error(path, f"id '{fid}' dosya adiyla uyusmuyor (dosya adina gore '{file_id}' olmali)")
        if fid in seen_ids:
            error(path, f"id '{fid}' baska bir dosyada da kullanilmis: {seen_ids[fid]}")
        seen_ids[fid] = rel(path)

    if "source" in fm and fm["source"] != source_dir:
        error(path, f"source '{fm['source']}' olmamali, bu klasor icin '{source_dir}' olmali")

    owasp = fm.get("owasp")
    if owasp is not None:
        if owasp not in OWASP_CODES:
            error(path, f"owasp '{owasp}' gecersiz. A01..A10 olmali")
        elif owasp != owasp_from_name:
            error(path, f"owasp '{owasp}' dosya adindaki '{owasp_from_name}' ile uyusmuyor")

    if "cwe" in fm and not re.fullmatch(r"CWE-\d+", str(fm["cwe"])):
        error(path, f"cwe '{fm['cwe']}' gecersiz. Ornek: CWE-89")

    severity = fm.get("severity")
    if severity is not None and severity not in SEVERITIES:
        error(path, f"severity '{severity}' gecersiz. Secenekler: {', '.join(sorted(SEVERITIES))}")

    if "cvss_score" in fm:
        try:
            score = float(fm["cvss_score"])
            if not 0.0 <= score <= 10.0:
                error(path, f"cvss_score {score} 0-10 arasinda olmali")
            elif severity in SEVERITY_RANGES:
                lo, hi = SEVERITY_RANGES[severity]
                if not lo <= score <= hi:
                    error(path, f"cvss_score {score} ile severity '{severity}' uyusmuyor "
                                f"('{severity}' icin {lo}-{hi} arasi olmali)")
        except (TypeError, ValueError):
            error(path, f"cvss_score sayi olmali, '{fm['cvss_score']}' degil")

    if "cvss_vector" in fm and not str(fm["cvss_vector"]).startswith("CVSS:3.1/"):
        error(path, "cvss_vector 'CVSS:3.1/' ile baslamali. https://www.first.org/cvss/calculator/3.1")

    if "status" in fm and fm["status"] not in STATUSES:
        error(path, f"status '{fm['status']}' gecersiz. Secenekler: draft, confirmed, reviewed")

    if "tester" in fm and str(fm["tester"]).strip().lower() in PLACEHOLDERS:
        error(path, "tester alanina kendi isminizi yazin")

    if "date" in fm:
        try:
            date.fromisoformat(str(fm["date"]))
        except ValueError:
            error(path, f"date '{fm['date']}' gecersiz. Format: YYYY-AA-GG (ornek 2026-10-05)")

    evidence = fm.get("evidence", [])
    if not isinstance(evidence, list):
        error(path, "evidence bir liste olmali (her satir '  - evidence/...png')")
        evidence = []
    if not evidence and fm.get("status") in {"confirmed", "reviewed"}:
        error(path, "confirmed/reviewed bir bulguda en az bir kanit (evidence) olmali")
    for ev in evidence:
        ev_path = ROOT / ev
        if not ev_path.is_file():
            error(path, f"Kanit dosyasi bulunamadi: {ev}")
        elif not ev.startswith(f"evidence/{source_dir}/"):
            error(path, f"Kanit evidence/{source_dir}/ klasorunde olmali: {ev}")
        elif not ev_path.name.startswith(file_id + "-"):
            error(path, f"Kanit adi '{file_id}-<n>.png' ile baslamali: {ev}")

    for link in re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", body):
        if link.startswith(("http://", "https://")):
            continue
        if not (path.parent / link).resolve().is_file():
            error(path, f"Metindeki resim linki bulunamadi: {link}")


def check_findings():
    findings_dir = ROOT / "findings"
    seen_ids = {}
    for p in findings_dir.iterdir():
        if p.is_file() and p.name != "_TEMPLATE.md":
            error(p, "findings/ kokune dosya konmaz. findings/juice-shop/ veya findings/portswigger/ kullanin")
        elif p.is_dir() and p.name not in SOURCES:
            error(p, "Bilinmeyen klasor. Sadece findings/juice-shop/ ve findings/portswigger/ var")
    for source_dir in SOURCES:
        folder = findings_dir / source_dir
        if not folder.is_dir():
            continue
        for p in sorted(folder.rglob("*")):
            if p.is_dir():
                error(p, "Alt klasor acmayin, dosyalari dogrudan klasore koyun")
            elif p.name == ".gitkeep":
                continue
            elif p.suffix.lower() != ".md":
                error(p, "findings/ icinde sadece .md dosyasi olur. Resimler evidence/ klasorune")
            else:
                check_finding(p, source_dir, seen_ids)
    return seen_ids


def check_evidence(finding_ids):
    evidence_dir = ROOT / "evidence"
    for p in evidence_dir.iterdir():
        if p.is_file() and p.name != ".gitkeep":
            error(p, "evidence/ kokune dosya konmaz. evidence/juice-shop/ veya evidence/portswigger/ kullanin")
    for source_dir, prefix in SOURCES.items():
        folder = evidence_dir / source_dir
        if not folder.is_dir():
            continue
        for p in sorted(folder.rglob("*")):
            if p.is_dir() or p.name == ".gitkeep":
                continue
            m = EVIDENCE_NAME.match(p.name)
            if not m:
                error(p, "Kanit adi formati yanlis. Ornek: JS-A05-001-1.png")
                continue
            if not p.name.startswith(prefix + "-"):
                error(p, f"{p.name[:2]}- kanitlari evidence/{'juice-shop' if prefix == 'PS' else 'portswigger'}/ icinde olmali")
            if m.group(1) not in finding_ids:
                warn(p, f"Bu kanita ait bulgu dosyasi yok ({m.group(1)})")


def check_progress():
    progress_dir = ROOT / "progress"
    if not progress_dir.is_dir():
        return
    for p in sorted(progress_dir.iterdir()):
        if p.name == ".gitkeep":
            continue
        if p.suffix != ".json":
            error(p, "progress/ icinde sadece 'python scripts/progress.py save <isim>' ile olusan .json dosyalari olur")
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            error(p, f"Bozuk JSON ({e.msg}, satir {e.lineno}). Dosyayi elle degistirmeyin, 'save' ile yeniden olusturun")
            continue
        missing = [k for k in ("member", "continue_code", "solved_count", "solved", "juice_shop_version") if k not in data]
        if missing:
            error(p, f"Eksik alanlar: {', '.join(missing)}. 'save' komutuyla yeniden olusturun")
            continue
        if p.stem != str(data["member"]).lower():
            error(p, f"Dosya adi member alaniyla uyusmuyor ('{str(data['member']).lower()}.json' olmali)")
        if data["solved_count"] != len(data["solved"]):
            error(p, "solved_count ile solved listesi uyusmuyor. Dosyayi elle degistirmeyin")
        for s in data["solved"]:
            if s.get("owasp") not in OWASP_CODES | {"-"}:
                error(p, f"Gecersiz owasp degeri: {s.get('owasp')}")


def check_repo_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix.lower() == ".burp":
                error(p, "Burp proje dosyalari repoya eklenmez")
            elif p.stat().st_size > MAX_FILE_MB * 1024 * 1024:
                error(p, f"Dosya {MAX_FILE_MB} MB'dan buyuk. Ekran goruntusunu kirpin veya sikistirin")


def report():
    for kind, items in (("error", errors), ("warning", warnings)):
        for path, msg in items:
            if IN_CI:
                print(f"::{kind} file={path}::{msg}")
            else:
                label = "HATA " if kind == "error" else "UYARI"
                print(f"[{label}] {path}: {msg}")
    print()
    if errors:
        print(f"{len(errors)} hata, {len(warnings)} uyari. Hatalari duzeltip tekrar deneyin.")
    else:
        print(f"Kontrol gecti. ({len(warnings)} uyari)")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    finding_ids = check_findings()
    check_evidence(finding_ids)
    check_progress()
    check_repo_files()
    report()
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
