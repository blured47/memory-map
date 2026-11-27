"""AI 메모 분류 정확도 측정 (제안서 5단계)

예시 메모(memos.json)를 하나씩 AI로 분류하고, 사람이 미리 적어 둔 정답과 비교한다.
Ollama 가 켜져 있어야 한다. 실행 (backend 폴더에서):

    python -m evaluation.evaluate            # 30개 전부
    python -m evaluation.evaluate --limit 3  # 앞의 3개만 빠르게

결과는 프로젝트 맨 바깥 results/ 폴더에 저장된다.
"""

import argparse
import json
import re
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASET = HERE / "memos.json"
RESULTS_DIR = HERE.parents[1] / "results"

CATEGORY_NAMES = {
    "interest": "관심사",
    "recommendation": "추천받은 것",
    "question": "물어볼 것",
    "anniversary": "기념일",
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", str(text)).lower()


def _categories(gold: dict) -> list[str]:
    c = gold["category"]
    return c if isinstance(c, list) else [c]


def _keyword_hit(gold: dict, pred: dict) -> bool:
    """핵심어 중 하나라도 들어 있으면 맞힘. 핵심어가 ["성수동", "소금빵"] 같은 묶음이면 묶음 안의 단어가 모두 들어 있어야 한다"""
    content = _norm(pred["content"])
    return any(
        all(_norm(w) in content for w in k) if isinstance(k, list) else _norm(k) in content
        for k in gold["keywords"]
    )


def _matches(gold: dict, pred: dict) -> bool:
    """사람·항목이 같고, 정답 핵심어 중 하나가 AI 결과 문장에 들어 있으면 맞힌 것으로 본다"""
    return pred["person"] == gold["person"] and pred["category"] in _categories(gold) and _keyword_hit(gold, pred)


def _same_date(gold_date: str, pred_date: str | None) -> bool:
    """'3월 14일' 과 '3/14' 처럼 표기가 달라도 숫자가 같으면 같은 날짜로 본다"""
    if not pred_date:
        return False
    gold_nums, pred_nums = re.findall(r"\d+", gold_date), re.findall(r"\d+", pred_date)
    if gold_nums:
        return gold_nums == pred_nums
    return _norm(gold_date) == _norm(pred_date)


def score_memo(answer: list[dict], predictions: list[dict]) -> dict:
    """메모 하나의 채점 결과"""
    used = set()
    hits, misses = [], []
    for gold in answer:
        idx = next((i for i, p in enumerate(predictions) if i not in used and _matches(gold, p)), None)
        if idx is None:
            misses.append(gold)
        else:
            used.add(idx)
            hits.append((gold, predictions[idx]))
    extras = [p for i, p in enumerate(predictions) if i not in used]

    # 틀린 이유 분류: 사람만 틀림 / 항목만 틀림
    person_mixups = category_mixups = 0
    for p in extras:
        for g in misses:
            if not _keyword_hit(g, p):
                continue
            if p["person"] != g["person"] and p["category"] in _categories(g):
                person_mixups += 1
                break
            if p["person"] == g["person"] and p["category"] not in _categories(g):
                category_mixups += 1
                break

    dated = [(g, p) for g, p in hits if g.get("date")]
    return {
        "hits": hits,
        "misses": misses,
        "extras": extras,
        "person_mixups": person_mixups,
        "category_mixups": category_mixups,
        "dates_total": len(dated),
        "dates_correct": sum(_same_date(g["date"], p.get("date")) for g, p in dated),
    }


def _ratio(a: int, b: int) -> float | None:
    return a / b if b else None


def summarize(scored: list[dict]) -> dict:
    """여러 메모의 채점 결과를 합쳐 정밀도·재현율·F1 을 계산한다"""
    tp, fn, fp = Counter(), Counter(), Counter()
    for s in scored:
        for _, p in s["hits"]:
            tp[p["category"]] += 1
        for g in s["misses"]:
            fn[_categories(g)[0]] += 1
        for p in s["extras"]:
            fp[p["category"]] += 1

    def prf(t: int, n: int, f: int) -> dict:
        precision, recall = _ratio(t, t + f), _ratio(t, t + n)
        f1 = 2 * precision * recall / (precision + recall) if precision and recall else 0.0
        return {"tp": t, "fn": n, "fp": f, "precision": precision, "recall": recall, "f1": f1}

    empty = [s for s in scored if s["empty_memo"]]
    return {
        "memos": len(scored),
        "overall": prf(sum(tp.values()), sum(fn.values()), sum(fp.values())),
        "by_category": {c: prf(tp[c], fn[c], fp[c]) for c in CATEGORY_NAMES},
        "perfect_memos": sum(not s["misses"] and not s["extras"] for s in scored),
        "empty_memos": len(empty),
        "empty_memos_correct": sum(not s["extras"] for s in empty),
        "person_mixups": sum(s["person_mixups"] for s in scored),
        "category_mixups": sum(s["category_mixups"] for s in scored),
        "dates_total": sum(s["dates_total"] for s in scored),
        "dates_correct": sum(s["dates_correct"] for s in scored),
        "seconds_total": sum(s["seconds"] for s in scored),
    }


def _pct(x: float | None) -> str:
    return "-" if x is None else f"{x * 100:.0f}%"


def _item(d: dict) -> str:
    cats = "/".join(CATEGORY_NAMES[c] for c in ([d["category"]] if isinstance(d["category"], str) else d["category"]))
    text = d.get("content") or " · ".join("+".join(k) if isinstance(k, list) else k for k in d["keywords"])
    date = f" ({d['date']})" if d.get("date") else ""
    return f"{d['person']} · {cats} · {text}{date}"


def to_markdown(summary: dict, scored: list[dict], model: str) -> str:
    o = summary["overall"]
    lines = [
        "# AI 메모 분류 정확도",
        "",
        f"- 모델: `{model}` (Ollama, 내 컴퓨터에서 실행)",
        f"- 예시 메모: {summary['memos']}개 (`backend/evaluation/memos.json`, 지어낸 내용)",
        f"- 걸린 시간: 총 {summary['seconds_total']:.0f}초, 메모당 평균 {summary['seconds_total'] / max(summary['memos'], 1):.1f}초",
        "",
        "## 전체",
        "",
        "| 지표 | 값 | 뜻 |",
        "|---|---|---|",
        f"| 정밀도 | {_pct(o['precision'])} | AI가 뽑은 것 중 맞은 비율 ({o['tp']}/{o['tp'] + o['fp']}) |",
        f"| 재현율 | {_pct(o['recall'])} | 정답 중 AI가 찾아낸 비율 ({o['tp']}/{o['tp'] + o['fn']}) |",
        f"| F1 | {_pct(o['f1'])} | 정밀도와 재현율의 조화 평균 |",
        f"| 완벽히 맞힌 메모 | {summary['perfect_memos']}/{summary['memos']} | 빠뜨린 것도, 잘못 뽑은 것도 없는 메모 |",
        f"| 내용 없는 메모 | {summary['empty_memos_correct']}/{summary['empty_memos']} | 아무것도 안 뽑아야 하는 메모에서 정말 안 뽑은 수 |",
        f"| 기념일 날짜 | {summary['dates_correct']}/{summary['dates_total']} | 맞힌 기념일 중 날짜까지 맞은 수 |",
        f"| 사람 혼동 | {summary['person_mixups']}건 | 내용은 맞는데 다른 사람 카드에 넣음 |",
        f"| 항목 혼동 | {summary['category_mixups']}건 | 내용은 맞는데 다른 항목으로 분류함 |",
        "",
        "## 항목별",
        "",
        "| 항목 | 정밀도 | 재현율 | F1 |",
        "|---|---|---|---|",
    ]
    for c, name in CATEGORY_NAMES.items():
        m = summary["by_category"][c]
        lines.append(f"| {name} | {_pct(m['precision'])} | {_pct(m['recall'])} | {_pct(m['f1'])} |")

    lines += ["", "## 틀린 메모", ""]
    wrong = [s for s in scored if s["misses"] or s["extras"]]
    if not wrong:
        lines.append("없음")
    for s in wrong:
        lines += [f"### {s['id']}. {', '.join(s['people'])}", "", f"> {s['memo']}", ""]
        lines += [f"- 빠뜨림: {_item(g)}" for g in s["misses"]]
        lines += [f"- 잘못 뽑음: {_item(p)}" for p in s["extras"]]
        lines.append("")
    return "\n".join(lines)


def run(limit: int | None = None) -> tuple[dict, list[dict], str]:
    from app import memo_ai
    from app.config import OLLAMA_MODEL

    dataset = json.loads(DATASET.read_text(encoding="utf-8"))[:limit]
    scored = []
    for memo in dataset:
        start = time.perf_counter()
        predictions = memo_ai.classify_memo(memo["memo"], memo["people"])
        seconds = time.perf_counter() - start
        s = score_memo(memo["answer"], predictions)
        s.update(id=memo["id"], people=memo["people"], memo=memo["memo"], predictions=predictions,
                 seconds=seconds, empty_memo=not memo["answer"])
        scored.append(s)
        print(f"[{memo['id']:>2}/{len(dataset)}] {seconds:4.1f}초  맞힘 {len(s['hits'])}  빠뜨림 {len(s['misses'])}  잘못 뽑음 {len(s['extras'])}")
    return summarize(scored), scored, OLLAMA_MODEL


def main():
    parser = argparse.ArgumentParser(description="AI 메모 분류 정확도 측정")
    parser.add_argument("--limit", type=int, help="앞에서부터 이 개수만 측정")
    parser.add_argument("--name", default="memo-accuracy", help="결과 파일 이름 (예: memo-accuracy-before)")
    args = parser.parse_args()

    summary, scored, model = run(args.limit)
    RESULTS_DIR.mkdir(exist_ok=True)
    report = RESULTS_DIR / f"{args.name}.md"
    report.write_text(to_markdown(summary, scored, model) + "\n", encoding="utf-8")
    raw = [{k: s[k] for k in ("id", "people", "memo", "predictions", "seconds")} for s in scored]
    (RESULTS_DIR / f"{args.name}.json").write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    o = summary["overall"]
    print(f"\n정밀도 {_pct(o['precision'])} · 재현율 {_pct(o['recall'])} · F1 {_pct(o['f1'])}")
    print(f"결과: {report}")


if __name__ == "__main__":
    main()
