"""요구 문항의 소관 과를 배분기준표에 따라 추천한다."""

from __future__ import annotations

import csv
import re
import unicodedata
from pathlib import Path


기본_폴더 = Path(__file__).resolve().parent
기본_기준표 = 기본_폴더 / "data" / "배분기준표_소관키워드_304건.csv"
기본_조직도 = 기본_폴더 / "data" / "A부_조직도_26개과.csv"


def _정규화(문자열: str) -> str:
    """표기 차이만 줄이고, 문장의 뜻은 바꾸지 않는다."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", 문자열).casefold()).strip()


def 소관과_추천(
    요구문항: str,
    기준표_경로: str | Path = 기본_기준표,
    조직도_경로: str | Path = 기본_조직도,
) -> dict[str, object]:
    """소관 과 1순위와 판정 근거를 반환한다.

    최고 우선순위가 같은 서로 다른 과가 있거나 키워드가 하나도
    맞지 않으면 한 과를 임의로 고르지 않고 ``확인필요``로 반환한다.
    """
    if not isinstance(요구문항, str) or not 요구문항.strip():
        raise ValueError("요구문항은 비어 있지 않은 문자열이어야 합니다.")

    with Path(조직도_경로).open(encoding="utf-8-sig", newline="") as 파일:
        조직도_과 = {행["과"].strip() for 행 in csv.DictReader(파일)}

    정규화_문항 = _정규화(요구문항)
    일치_규칙: list[dict[str, object]] = []

    with Path(기준표_경로).open(encoding="utf-8-sig", newline="") as 파일:
        for 행 in csv.DictReader(파일):
            과 = 행["과"].strip()
            if 과 not in 조직도_과:
                raise ValueError(f"조직도에 없는 과가 기준표에 있습니다: {과}")

            키워드 = 행["키워드"].strip()
            제외어 = [값.strip() for 값 in 행["제외어"].split("|") if 값.strip()]
            if _정규화(키워드) not in 정규화_문항:
                continue
            if any(_정규화(값) in 정규화_문항 for 값 in 제외어):
                continue

            일치_규칙.append(
                {
                    "규칙": 행["rule_id"].strip(),
                    "과": 과,
                    "키워드": 키워드,
                    "우선순위": int(행["우선순위"]),
                    "배분구분": 행["유형"].strip(),
                }
            )

    if not 일치_규칙:
        return {"상태": "확인필요", "1순위": None, "후보과": [], "근거": []}

    최고_우선순위 = max(int(규칙["우선순위"]) for 규칙 in 일치_규칙)
    최고_규칙 = [규칙 for 규칙 in 일치_규칙 if 규칙["우선순위"] == 최고_우선순위]
    후보과 = list(dict.fromkeys(str(규칙["과"]) for 규칙 in 최고_규칙))

    if len(후보과) != 1:
        return {
            "상태": "확인필요",
            "1순위": None,
            "후보과": 후보과,
            "근거": 최고_규칙,
        }

    return {
        "상태": "추천",
        "1순위": 후보과[0],
        "후보과": 후보과,
        "근거": 최고_규칙,
    }


def _시험(시험_경로: str | Path = 기본_폴더 / "data" / "시험_요구문항_40건.csv") -> tuple[int, int]:
    """제공된 시험 CSV의 1순위 정답 수를 계산한다."""
    정답_수 = 0
    전체_수 = 0
    with Path(시험_경로).open(encoding="utf-8-sig", newline="") as 파일:
        for 행 in csv.DictReader(파일):
            전체_수 += 1
            결과 = 소관과_추천(행["요구내용"])
            정답_수 += 결과["1순위"] == 행["정답_배분과"]
    return 정답_수, 전체_수


if __name__ == "__main__":
    맞음, 전체 = _시험()
    print(f"1순위 정답: {맞음}/{전체}")
