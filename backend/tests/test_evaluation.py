import json

from evaluation import evaluate as ev


def p(person, category, content, date=None):
    return {"person": person, "category": category, "content": content, "date": date}


GOLD = [
    {"person": "민수", "category": "interest", "keywords": ["클라이밍"]},
    {"person": "민수", "category": "anniversary", "keywords": ["생일"], "date": "3월 14일"},
]


def test_keyword_match_ignores_spaces_and_wording():
    s = ev.score_memo(GOLD, [p("민수", "interest", "요즘 클라 이밍에 빠짐"), p("민수", "anniversary", "생일", "3/14")])
    assert len(s["hits"]) == 2 and not s["misses"] and not s["extras"]
    assert s["dates_correct"] == 1


def test_wrong_person_and_wrong_category_are_counted():
    gold = [{"person": "현우", "category": "recommendation", "keywords": ["칼국수"]},
            {"person": "현우", "category": "interest", "keywords": ["러닝"]}]
    s = ev.score_memo(gold, [p("지민", "recommendation", "칼국수집"), p("현우", "question", "러닝")])
    assert len(s["misses"]) == 2 and len(s["extras"]) == 2
    assert s["person_mixups"] == 1 and s["category_mixups"] == 1


def test_either_category_is_accepted_when_gold_lists_two():
    gold = [{"person": "유나", "category": ["question", "interest"], "keywords": ["면허"]}]
    assert ev.score_memo(gold, [p("유나", "interest", "운전면허 따는 중")])["hits"]


def test_grouped_keywords_need_every_word():
    gold = [{"person": "다인", "category": "recommendation", "keywords": [["성수동", "소금빵"]]}]
    assert ev.score_memo(gold, [p("다인", "recommendation", "성수동에 있는 소금빵 맛집")])["hits"]
    assert not ev.score_memo(gold, [p("다인", "recommendation", "소금빵 맛집")])["hits"]


def test_one_prediction_cannot_answer_two_golds():
    gold = [{"person": "A", "category": "interest", "keywords": ["러닝"]}] * 2
    s = ev.score_memo(gold, [p("A", "interest", "러닝")])
    assert len(s["hits"]) == 1 and len(s["misses"]) == 1


def test_summary_numbers():
    s1 = ev.score_memo(GOLD, [p("민수", "interest", "클라이밍"), p("민수", "question", "산책")])
    s2 = ev.score_memo([], [])
    for s, empty in ((s1, False), (s2, True)):
        s.update(seconds=1.0, empty_memo=empty)
    summary = ev.summarize([s1, s2])
    o = summary["overall"]
    assert (o["tp"], o["fn"], o["fp"]) == (1, 1, 1)
    assert o["precision"] == 0.5 and o["recall"] == 0.5
    assert summary["empty_memos_correct"] == 1 and summary["perfect_memos"] == 1


def test_dataset_is_valid():
    data = json.loads(ev.DATASET.read_text(encoding="utf-8"))
    assert len({m["id"] for m in data}) == len(data) == 30
    for m in data:
        for g in m["answer"]:
            assert g["person"] in m["people"], m["id"]
            assert set(ev._categories(g)) <= set(ev.CATEGORY_NAMES), m["id"]
            assert g["keywords"], m["id"]
