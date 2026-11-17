"""Extract the HCMC table from Cong Bao 921+922, Decision 19/2025/QD-TTg.

Usage: python scripts/import-hcm-divisions.py /path/to/2025_921+922_19-2025-QD-TTg.pdf
Requires pypdf. No network access or OCR guesses; fails if the table changes.
"""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

source = Path(sys.argv[1])
text = "\n".join(page.extract_text() for page in PdfReader(source).pages)
section = text.split("79. THÀNH PHỐ HỒ CHÍ MINH", 1)[1].split("80. TỈNH TÂY NINH", 1)[0]
rows = re.findall(r"^(\d{5})\s+((Phường|Xã|Đặc khu)\s+[^\n]+)", section, re.MULTILINE)
assert len(rows) == len({code for code, _, _ in rows}) == 168
assert Counter(kind for _, _, kind in rows) == {"Phường": 113, "Xã": 54, "Đặc khu": 1}
data = {
    "provinceCode": "79",
    "provinceName": "Thành phố Hồ Chí Minh",
    "effectiveFrom": "2025-07-01",
    "source": {
        "title": "Công báo 921 + 922, 18/07/2025, trang 45–52; Quyết định 19/2025/QĐ-TTg",
        "url": "https://congbao.chinhphu.vn/van-ban/quyet-dinh-so-19-2025-qd-ttg-45430/57441.htm",
        "pdfSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    },
    "wards": [{"code": code, "name": " ".join(name.split()), "kind": kind} for code, name, kind in rows],
}
target = Path(__file__).resolve().parents[1] / "src/data/hcm-wards.json"
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Extracted 168 units (113 wards, 54 communes, 1 special zone), unique 5-digit codes.")
