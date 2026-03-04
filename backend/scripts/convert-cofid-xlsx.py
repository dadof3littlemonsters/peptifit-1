#!/usr/bin/env python3

import json
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def col_letters_to_index(reference: str) -> int:
    letters = "".join(char for char in reference if char.isalpha())
    total = 0
    for char in letters:
        total = total * 26 + (ord(char.upper()) - ord("A") + 1)
    return total - 1


def load_shared_strings(zip_file: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zip_file.namelist():
        return []

    root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
    values = []

    for item in root.findall("main:si", NS):
        text = "".join(node.text or "" for node in item.iterfind(".//main:t", NS))
        values.append(text)

    return values


def workbook_sheet_path(zip_file: ZipFile, target_name: str) -> str:
    workbook = ET.fromstring(zip_file.read("xl/workbook.xml"))
    rels = ET.fromstring(zip_file.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("pkgrel:Relationship", NS)
    }

    for sheet in workbook.find("main:sheets", NS):
        if sheet.attrib.get("name") == target_name:
            relation_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            return f"xl/{rel_map[relation_id]}"

    raise ValueError(f'Sheet "{target_name}" not found in workbook')


def cell_value(cell, shared_strings: list[str]) -> str:
    value_node = cell.find("main:v", NS)
    if value_node is None:
        inline = cell.find("main:is", NS)
        if inline is None:
            return ""
        return "".join(node.text or "" for node in inline.iterfind(".//main:t", NS))

    value = value_node.text or ""
    cell_type = cell.attrib.get("t")

    if cell_type == "s":
        return shared_strings[int(value)]

    return value


def rows_from_sheet(zip_file: ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[str]]:
    root = ET.fromstring(zip_file.read(sheet_path))
    sheet_data = root.find("main:sheetData", NS)
    rows: list[list[str]] = []

    for row in sheet_data.findall("main:row", NS):
        values: list[str] = []

        for cell in row.findall("main:c", NS):
            reference = cell.attrib.get("r", "")
            column_index = col_letters_to_index(reference)

            while len(values) <= column_index:
                values.append("")

            values[column_index] = cell_value(cell, shared_strings).strip()

        rows.append(values)

    return rows


def trim_record(record: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in record.items() if value != ""}


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: convert-cofid-xlsx.py <input.xlsx> [output.json]", file=sys.stderr)
        return 1

    input_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 else None

    with ZipFile(input_path) as zip_file:
        shared_strings = load_shared_strings(zip_file)
        sheet_path = workbook_sheet_path(zip_file, "1.3 Proximates")
        rows = rows_from_sheet(zip_file, sheet_path, shared_strings)

    if len(rows) < 4:
        raise ValueError("Unexpected CoFID workbook structure: not enough rows in 1.3 Proximates")

    headers = rows[0]
    records = []

    for row in rows[3:]:
        if not row:
            continue

        padded = row + [""] * max(0, len(headers) - len(row))
        record = trim_record({headers[index]: padded[index] for index in range(len(headers)) if headers[index]})

        if not record.get("Food Code") or not record.get("Food Name"):
            continue

        records.append(record)

    payload = json.dumps(records, indent=2)

    if output_path:
        output_path.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
