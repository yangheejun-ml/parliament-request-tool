(function attachEngine(globalScope) {
  "use strict";

  const state = {
    rules: [],
    departments: new Set(),
    ready: false,
  };

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = text.replace(/^\uFEFF/, "");

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
        continue;
      }

      if (character === '"') {
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

    if (quoted) {
      throw new Error("CSV의 따옴표가 닫히지 않았습니다.");
    }

    const [headers, ...dataRows] = rows;
    if (!headers) {
      throw new Error("CSV가 비어 있습니다.");
    }

    return dataRows
      .filter((values) => values.some((value) => value.trim() !== ""))
      .map((values) =>
        Object.fromEntries(
          headers.map((header, index) => [header.trim(), values[index] ?? ""]),
        ),
      );
  }

  function requireColumns(rows, columns, label) {
    if (rows.length === 0) {
      throw new Error(`${label}에 데이터가 없습니다.`);
    }

    for (const column of columns) {
      if (!Object.hasOwn(rows[0], column)) {
        throw new Error(`${label}에 필수 열이 없습니다: ${column}`);
      }
    }
  }

  function initializeFromCsv(ruleCsv, organizationCsv) {
    const ruleRows = parseCsv(ruleCsv);
    const organizationRows = parseCsv(organizationCsv);

    requireColumns(
      ruleRows,
      ["과", "키워드", "제외어", "우선순위"],
      "배분기준표",
    );
    requireColumns(organizationRows, ["과"], "조직도");

    const departments = new Set(
      organizationRows.map((row) => row.과.trim()).filter(Boolean),
    );

    const rules = ruleRows.map((row) => {
      const priority = Number(row.우선순위);
      const department = row.과.trim();
      const keyword = row.키워드.trim();

      if (!department || !keyword || !Number.isFinite(priority)) {
        throw new Error(`배분기준표 규칙 값이 올바르지 않습니다: ${row.rule_id || "번호 없음"}`);
      }

      return {
        department,
        keyword,
        exclusions: row.제외어
          .split("|")
          .map((word) => word.trim())
          .filter(Boolean),
        priority,
      };
    });

    state.rules = rules;
    state.departments = departments;
    state.ready = true;

    return {
      규칙수: rules.length,
      조직도과수: departments.size,
    };
  }

  async function initialize(options = {}) {
    if (state.ready && !options.force) {
      return {
        규칙수: state.rules.length,
        조직도과수: state.departments.size,
      };
    }

    if (typeof fetch !== "function") {
      throw new Error("브라우저 초기화에는 fetch가 필요합니다.");
    }

    const ruleUrl = options.ruleUrl || "../data/배분기준표_소관키워드_304건.csv";
    const organizationUrl = options.organizationUrl || "../data/A부_조직도_26개과.csv";
    const [ruleResponse, organizationResponse] = await Promise.all([
      fetch(ruleUrl),
      fetch(organizationUrl),
    ]);

    if (!ruleResponse.ok) {
      throw new Error(`배분기준표를 읽지 못했습니다: ${ruleResponse.status}`);
    }
    if (!organizationResponse.ok) {
      throw new Error(`조직도를 읽지 못했습니다: ${organizationResponse.status}`);
    }

    return initializeFromCsv(
      await ruleResponse.text(),
      await organizationResponse.text(),
    );
  }

  function classify(requirement) {
    if (!state.ready) {
      throw new Error("엔진이 초기화되지 않았습니다.");
    }
    if (typeof requirement !== "string") {
      throw new TypeError("요구내용은 문자열이어야 합니다.");
    }

    const normalizedRequirement = requirement.toLocaleLowerCase("ko-KR");
    const candidatesByDepartment = new Map();

    for (const rule of state.rules) {
      if (!state.departments.has(rule.department)) {
        continue;
      }

      const keyword = rule.keyword.toLocaleLowerCase("ko-KR");
      if (!normalizedRequirement.includes(keyword)) {
        continue;
      }

      const excluded = rule.exclusions.some((word) =>
        normalizedRequirement.includes(word.toLocaleLowerCase("ko-KR")),
      );
      if (excluded) {
        continue;
      }

      const score = rule.priority + rule.keyword.length / 10;
      const current = candidatesByDepartment.get(rule.department);

      if (!current || score > current.점수) {
        candidatesByDepartment.set(rule.department, {
          과: rule.department,
          점수: Number(score.toFixed(1)),
          근거키워드: rule.keyword,
        });
      }
    }

    return [...candidatesByDepartment.values()]
      .sort(
        (left, right) =>
          right.점수 - left.점수 ||
          right.근거키워드.length - left.근거키워드.length ||
          left.과.localeCompare(right.과, "ko-KR"),
      )
      .slice(0, 3);
  }

  const api = {
    classify,
    initialize,
    initializeFromCsv,
    parseCsv,
  };

  if (typeof module === "object" && module.exports) {
    const fs = require("node:fs");
    const path = require("node:path");
    const root = path.resolve(__dirname, "..");
    const ruleCsv = fs.readFileSync(
      path.join(root, "data", "배분기준표_소관키워드_304건.csv"),
      "utf8",
    );
    const organizationCsv = fs.readFileSync(
      path.join(root, "data", "A부_조직도_26개과.csv"),
      "utf8",
    );
    initializeFromCsv(ruleCsv, organizationCsv);
    module.exports = api;
  } else {
    globalScope.RequirementEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
