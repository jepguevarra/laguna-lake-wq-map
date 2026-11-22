import re, csv, sys

src, out = sys.argv[1], sys.argv[2]
pages = open(src, encoding="utf-8").read().split("\f")

VAL = r"(\*|-|[\d,]*\.?\d+(?:E[+-]\d+)?)"
VALS4 = re.compile(r"\s+".join([VAL] * 4) + r"(?=\s|$)")
TRIB_CODE = re.compile(r"^\s{0,3}(\d{1,2}[UuMm]?)\s+(.*)$")
LAKE_CODE = re.compile(r"^\s*Stn\.\s+([IVX]+)\b(.*)$")
YEARS = [2009, 2010, 2011, 2012]

rows = []
for pno, page in enumerate(pages, 1):
    if "Annual Averages" not in page:
        continue
    lines = page.split("\n")
    group = param = unit = None
    for i, l in enumerate(lines):
        s = l.strip()
        if s in ("LAGUNA DE BAY", "TRIBUTARY RIVERS") and group is None:
            group = "lake" if s == "LAGUNA DE BAY" else "tributary"
            hdr = lines[i + 1].strip()
            if "," in hdr:
                param, unit = [x.strip() for x in hdr.split(",", 1)]
            else:
                param, unit = hdr, ""
    if not group:
        continue
    seen = set()
    for i, l in enumerate(lines):
        m = (LAKE_CODE if group == "lake" else TRIB_CODE).match(l)
        if not m:
            continue
        code = m.group(1).upper()
        if group == "lake":
            code = "Stn. " + code
        if code in seen:
            continue
        rest = m.group(2)
        v = VALS4.search(rest)
        if not v:
            # values may sit on the next non-empty line
            for j in range(i + 1, min(i + 3, len(lines))):
                v = VALS4.search(lines[j])
                if v:
                    break
        if not v:
            continue
        seen.add(code)
        for y, val in zip(YEARS, v.groups()):
            if val in ("*", "-"):
                continue
            rows.append({"group": group, "station": code, "parameter": param,
                         "unit": unit, "year": y, "value": float(val.replace(",", "")),
                         "pdf_page": pno})

with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
print(len(rows), "rows")
