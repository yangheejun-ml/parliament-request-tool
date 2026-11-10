(function attachCommon(globalScope) {
  "use strict";

  const STORAGE_KEY = "a부_국회요구자료_cases_v1";

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    if (quoted) throw new Error("CSV의 따옴표가 닫히지 않았습니다.");

    const [headers, ...dataRows] = rows;
    if (!headers) return [];
    return dataRows
      .filter((values) => values.some((value) => value.trim() !== ""))
      .map((values) =>
        Object.fromEntries(
          headers.map((header, index) => [header.trim(), values[index] ?? ""]),
        ),
      );
  }

  async function fetchCsv(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`자료를 읽지 못했습니다: ${response.status}`);
    return parseCsv(await response.text());
  }

  async function readCsvFile(file) {
    return parseCsv(await file.text());
  }

  function loadCases() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("저장된 접수 자료를 읽지 못했습니다.", error);
      return [];
    }
  }

  function saveCases(cases) {
    if (!Array.isArray(cases)) throw new TypeError("저장 자료는 배열이어야 합니다.");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    globalScope.dispatchEvent(new CustomEvent("app:cases-updated", { detail: cases }));
  }

  function clearCases() {
    localStorage.removeItem(STORAGE_KEY);
    globalScope.dispatchEvent(new CustomEvent("app:cases-updated", { detail: [] }));
  }

  function makeCaseId(row) {
    return `${row.파일명 || "직접등록"}::${row.문항번호 || "0"}`;
  }

  function summarizeCases(cases = loadCases()) {
    return cases.reduce(
      (summary, item) => {
        summary.전체 += 1;
        if (item.상태 === "배분확정") summary.배분확정 += 1;
        else summary.접수 += 1;
        return summary;
      },
      { 전체: 0, 접수: 0, 배분확정: 0 },
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  globalScope.AppCommon = {
    STORAGE_KEY,
    clearCases,
    fetchCsv,
    loadCases,
    makeCaseId,
    nowIso,
    parseCsv,
    readCsvFile,
    saveCases,
    summarizeCases,
  };
})(globalThis);
