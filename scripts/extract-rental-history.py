"""Extract only the ข้อมูลการเช่า worksheet into a private local JSON file."""
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import posixpath
import re
import sys
from zipfile import ZipFile
import xml.etree.ElementTree as ET

SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("backup/Rental.CharmBless.xlsx")
OUTPUT = Path(".local/rental-history/source.json")
SHEET_NAME = "ข้อมูลการเช่า"
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def column_name(reference: str) -> str:
    return "".join(char for char in reference if char.isalpha())


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Workbook not found: {SOURCE}")

    with ZipFile(SOURCE) as workbook:
        book = ET.fromstring(workbook.read("xl/workbook.xml"))
        rels = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.get("Id"): rel.get("Target") for rel in rels.findall("pkg:Relationship", NS)}
        sheet = next((item for item in book.findall("main:sheets/main:sheet", NS) if item.get("name") == SHEET_NAME), None)
        if sheet is None:
            raise SystemExit(f"Worksheet not found: {SHEET_NAME}")
        target = targets.get(sheet.get(f"{{{NS['rel']}}}id"))
        if not target:
            raise SystemExit(f"Worksheet relationship missing: {SHEET_NAME}")
        sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))

        shared_strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            strings = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared_strings = ["".join(node.itertext()) for node in strings.findall("main:si", NS)]

        root = ET.fromstring(workbook.read(str(PurePosixPath(sheet_path))))
        relationship_path = posixpath.join(posixpath.dirname(sheet_path), "_rels", posixpath.basename(sheet_path) + ".rels")
        link_targets = {}
        if relationship_path in workbook.namelist():
            rel_root = ET.fromstring(workbook.read(relationship_path))
            link_targets = {rel.get("Id"): rel.get("Target") for rel in rel_root.findall("pkg:Relationship", NS)}
        hyperlink_targets = {}
        for link in root.findall("main:hyperlinks/main:hyperlink", NS):
            reference = link.get("ref", "")
            relationship_id = link.get(f"{{{NS['rel']}}}id")
            location = link_targets.get(relationship_id) if relationship_id else link.get("location")
            if reference and location:
                hyperlink_targets[reference] = location
        extracted = []
        for row in root.findall("main:sheetData/main:row", NS):
            row_number = row.get("r", "0")
            cells = {}
            for cell in row.findall("main:c", NS):
                value = cell.find("main:v", NS)
                inline = cell.find("main:is", NS)
                text = value.text if value is not None else "".join(inline.itertext()) if inline is not None else ""
                if cell.get("t") == "s" and text:
                    text = shared_strings[int(text)]
                if text:
                    cells[column_name(cell.get("r", ""))] = text
            links = {column_name(reference): target for reference, target in hyperlink_targets.items() if re.search(r"\d+", reference).group() == row_number}
            if cells or links:
                extracted.append({"row": int(row_number), "cells": cells, "hyperlinks": links})

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"file": SOURCE.name, "sha256": sha256(SOURCE.read_bytes()).hexdigest(), "sheet": SHEET_NAME, "rows": extracted}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    OUTPUT.chmod(0o600)
    data_rows = [row for row in extracted if row["row"] > 1 and row["cells"].get("A")]
    print(json.dumps({"sheet": SHEET_NAME, "rows": len(data_rows), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
