(function attachSplitter(globalScope) {
  "use strict";

  const TITLE_RE = /^(?<위원회>.+?위원회)\s+(?<의원>의원\S+)\s+의원실\s+자료요구서$/;
  const DUE_RE = /제출기한:\s*(?<year>\d{4})\.\s*(?<month>\d{1,2})\.\s*(?<day>\d{1,2})\./;
  const ITEM_RE = /^(?<number>\d+)\.\s*(?<text>.*)$/;
  const SUBITEM_RE = /^[가-하]\.\s*/;
  const EXCLUDED_PREFIXES = ["수신:", "담당 보좌관:", "끝."];
  const FIELDS = ["파일명", "위원회", "의원", "제출기한", "문항번호", "요구내용", "세부항목", "비고"];

  function appendText(row, field, text, separator = " ") {
    row[field] = row[field] ? `${row[field]}${separator}${text}` : text;
  }

  function toIsoDate(match) {
    const year = match.groups.year;
    const month = match.groups.month.padStart(2, "0");
    const day = match.groups.day.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDocument({ fileName, text }) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    let committee = "";
    let member = "";
    let deadline = "";
    let current = null;
    let activeField = "요구내용";
    const rows = [];

    for (const line of lines) {
      const title = line.match(TITLE_RE);
      if (title) {
        committee = title.groups.위원회;
        member = title.groups.의원;
        continue;
      }

      const due = line.match(DUE_RE);
      if (due) deadline = toIsoDate(due);
      if (EXCLUDED_PREFIXES.some((prefix) => line.startsWith(prefix))) continue;

      const item = line.match(ITEM_RE);
      if (item) {
        current = {
          파일명: fileName,
          위원회: committee,
          의원: member,
          제출기한: deadline,
          문항번호: item.groups.number,
          요구내용: item.groups.text.trim(),
          세부항목: "",
          비고: "",
        };
        rows.push(current);
        activeField = "요구내용";
        continue;
      }

      if (!current) continue;
      if (SUBITEM_RE.test(line)) {
        activeField = "세부항목";
        appendText(current, activeField, line, " / ");
      } else if (line.startsWith("※")) {
        activeField = "비고";
        appendText(current, activeField, line.slice(1).trim(), " / ");
      } else {
        appendText(current, activeField, line);
      }
    }

    if (!committee || !member) throw new Error(`${fileName}: 위원회 또는 의원을 찾지 못했습니다.`);
    if (!deadline) throw new Error(`${fileName}: 제출기한을 찾지 못했습니다.`);
    if (rows.some((row) => !row.요구내용)) throw new Error(`${fileName}: 요구내용이 빈 문항이 있습니다.`);
    return rows;
  }

  function parseDocuments(documents) {
    return documents.flatMap(parseDocument);
  }

  function normalizeCsvRows(rows) {
    return rows.map((source, index) => {
      const missing = FIELDS.filter((field) => !(field in source));
      if (missing.length) throw new Error(`CSV ${index + 2}행에 열이 없습니다: ${missing.join(", ")}`);
      return Object.fromEntries(FIELDS.map((field) => [field, String(source[field] ?? "").trim()]));
    });
  }

  function expectedCount(fileName) {
    const match = String(fileName).match(/_(\d+)문항\.pdf$/i);
    return match ? Number(match[1]) : null;
  }

  globalScope.RequestSplitter = {
    FIELDS,
    expectedCount,
    normalizeCsvRows,
    parseDocument,
    parseDocuments,
  };
})(globalThis);
