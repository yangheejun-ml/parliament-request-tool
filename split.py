from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "원문"
OUTPUT_PATH = ROOT / "data" / "문항목록.csv"
FIELDNAMES = [
    "파일명",
    "위원회",
    "의원",
    "제출기한",
    "문항번호",
    "요구내용",
    "세부항목",
    "비고",
]

TITLE_RE = re.compile(
    r"^(?P<위원회>.+?위원회)\s+(?P<의원>의원\S+)\s+의원실\s+자료요구서$"
)
DUE_RE = re.compile(
    r"제출기한:\s*(?P<year>\d{4})\.\s*(?P<month>\d{1,2})\.\s*"
    r"(?P<day>\d{1,2})\."
)
ITEM_RE = re.compile(r"^(?P<number>\d+)\.\s*(?P<text>.*)$")
SUBITEM_RE = re.compile(r"^[가-하]\.\s*")
EXPECTED_COUNT_RE = re.compile(r"_(?P<count>\d+)문항\.pdf$")
EXCLUDED_PREFIXES = ("수신:", "담당 보좌관:", "끝.")


@dataclass
class ParsedPdf:
    path: Path
    expected_count: int
    rows: list[dict[str, str]]


def append_text(row: dict[str, str], field: str, text: str) -> None:
    row[field] = f"{row[field]}\n{text}" if row[field] else text


def extract_lines(path: Path) -> list[str]:
    reader = PdfReader(path)
    return [
        line.strip()
        for page in reader.pages
        for line in (page.extract_text() or "").splitlines()
        if line.strip()
    ]


def parse_pdf(path: Path) -> ParsedPdf:
    expected_match = EXPECTED_COUNT_RE.search(path.name)
    if not expected_match:
        raise ValueError(f"파일명에서 문항 수를 찾지 못했습니다: {path.name}")

    committee = ""
    member = ""
    deadline = ""
    rows: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    active_field = "요구내용"

    for line in extract_lines(path):
        title_match = TITLE_RE.match(line)
        if title_match:
            committee = title_match.group("위원회")
            member = title_match.group("의원")
            continue

        due_match = DUE_RE.search(line)
        if due_match:
            deadline = date(
                int(due_match.group("year")),
                int(due_match.group("month")),
                int(due_match.group("day")),
            ).isoformat()

        if line.startswith(EXCLUDED_PREFIXES):
            continue

        item_match = ITEM_RE.match(line)
        if item_match:
            current = {
                "파일명": path.name,
                "위원회": committee,
                "의원": member,
                "제출기한": deadline,
                "문항번호": item_match.group("number"),
                "요구내용": item_match.group("text").strip(),
                "세부항목": "",
                "비고": "",
            }
            rows.append(current)
            active_field = "요구내용"
            continue

        if current is None:
            continue

        if SUBITEM_RE.match(line):
            active_field = "세부항목"
            append_text(current, active_field, line)
        elif line.startswith("※"):
            active_field = "비고"
            append_text(current, active_field, line)
        else:
            append_text(current, active_field, line)

    if not committee or not member:
        raise ValueError(f"위원회 또는 의원을 찾지 못했습니다: {path.name}")
    if not deadline:
        raise ValueError(f"제출기한을 찾지 못했습니다: {path.name}")
    if any(not row["요구내용"] for row in rows):
        raise ValueError(f"요구내용이 빈 문항이 있습니다: {path.name}")

    return ParsedPdf(
        path=path,
        expected_count=int(expected_match.group("count")),
        rows=rows,
    )


def write_csv(parsed_files: list[ParsedPdf]) -> None:
    with OUTPUT_PATH.open("w", encoding="utf-8-sig", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for parsed in parsed_files:
            writer.writerows(parsed.rows)


def read_written_rows() -> list[dict[str, str]]:
    with OUTPUT_PATH.open("r", encoding="utf-8-sig", newline="") as input_file:
        return list(csv.DictReader(input_file))


def print_validation(
    parsed_files: list[ParsedPdf], written_rows: list[dict[str, str]]
) -> None:
    print("| 파일명 | 파일명의 문항 수 | 뽑은 문항 수 | 마지막 번호 | 번호 연속 | 일치(O/X) |")
    print("|---|---:|---:|---:|:---:|:---:|")

    all_valid = True
    for parsed in parsed_files:
        rows = [row for row in written_rows if row["파일명"] == parsed.path.name]
        numbers = [int(row["문항번호"]) for row in rows]
        last_number = numbers[-1] if numbers else 0
        continuous = numbers == list(range(1, last_number + 1))
        source_matches = rows == parsed.rows
        matches = (
            parsed.expected_count == len(rows) == last_number
            and continuous
            and source_matches
        )
        all_valid = all_valid and matches
        print(
            f"| {parsed.path.name} | {parsed.expected_count} | {len(rows)} | "
            f"{last_number} | {'O' if continuous else 'X'} | {'O' if matches else 'X'} |"
        )

    print("\n### 원문 PDF와 CSV 대조(파일별 1개)")
    print("| 파일명·문항 | 원문 PDF 추출값 | CSV 저장값 | 일치 |")
    print("|---|---|---|:---:|")
    for parsed in parsed_files:
        source_row = next(
            (
                row
                for row in parsed.rows
                if row["세부항목"] and row["비고"]
            ),
            None,
        )
        if source_row is None:
            raise ValueError(
                f"세부항목과 비고가 모두 있는 대조 문항이 없습니다: {parsed.path.name}"
            )
        csv_row = next(
            row
            for row in written_rows
            if row["파일명"] == parsed.path.name
            and row["문항번호"] == source_row["문항번호"]
        )
        source_text = format_example(source_row)
        csv_text = format_example(csv_row)
        print(
            f"| {parsed.path.name} · {source_row['문항번호']}번 | "
            f"{source_text} | {csv_text} | {'O' if source_row == csv_row else 'X'} |"
        )

    if not all_valid:
        raise ValueError("문항 수·번호 또는 원문 대조 결과가 일치하지 않습니다.")


def format_example(row: dict[str, str]) -> str:
    def one_line(value: str) -> str:
        return value.replace("\n", " / ").replace("|", "\\|")

    return (
        f"요구내용: {one_line(row['요구내용'])}<br>"
        f"세부항목: {one_line(row['세부항목'])}<br>"
        f"비고: {one_line(row['비고'])}"
    )


def main() -> None:
    pdf_paths = sorted(SOURCE_DIR.glob("*.pdf"))
    if len(pdf_paths) != 3:
        raise ValueError(f"원문 PDF가 3건이 아닙니다: {len(pdf_paths)}건")

    parsed_files = [parse_pdf(path) for path in pdf_paths]
    write_csv(parsed_files)
    written_rows = read_written_rows()

    if len(written_rows) != sum(len(parsed.rows) for parsed in parsed_files):
        raise ValueError("CSV를 다시 읽은 행 수가 추출한 전체 문항 수와 다릅니다.")

    print_validation(parsed_files, written_rows)


if __name__ == "__main__":
    main()
