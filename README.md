# Memory Map — 개인 인간관계 기억지도

사진과 자유 메모만 올리면 만남 장소·시간·대화 내용이 사람별로 정리되고, 지도 위에 시각화되며,
평소보다 오래 연락하지 못한 사람을 알려주는 시스템입니다.

> 오픈소스기초및설계 3반 9조 — 안태현, 최연성, 임지수

## 개발 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 사람 등록, 만남 기록 CRUD | 진행 중 |
| 2 | 카카오맵 연동 (장소 검색, 기억지도) | 예정 |
| 3 | 사진 EXIF 기반 자동 기록 (Pillow) | 예정 |
| 4 | AI 메모 자동 분류 (Ollama), 맞춤형 연락 알림 | 예정 |
| 5 | 통합 테스트, 정확도 검증 | 예정 |

## 기술 스택

- 백엔드: Python, FastAPI, SQLAlchemy, SQLite
- 프론트엔드: HTML / CSS / JavaScript, 카카오맵 JavaScript SDK
- 사진 처리: Pillow (EXIF)
- AI: Ollama (로컬 LLM — 메모는 외부로 전송하지 않음)
- 배포: Docker

## 실행 방법

### 로컬 (Python 3.12+)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # 카카오 키 입력
cd backend && uvicorn app.main:app --reload
```

브라우저에서 http://localhost:8000 접속, API 문서는 http://localhost:8000/docs

### Docker

```bash
cp .env.example .env
docker compose up --build
```

### 테스트

```bash
cd backend && pytest
```

## API

서버 실행 후 http://localhost:8000/docs 에서 전체 API 설명을 보고 직접 요청을 보내 테스트할 수 있습니다.

### 사람

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/persons` | 사람 목록 (이름순) |
| POST | `/api/persons` | 사람 추가 |
| GET | `/api/persons/{id}` | 사람 상세 (만남 횟수 `meeting_count`, 마지막 만남 `last_met_at` 포함) |
| PATCH | `/api/persons/{id}` | 사람 정보 수정 (보낸 항목만 변경) |
| DELETE | `/api/persons/{id}` | 사람 삭제 |

```json
// POST /api/persons
{ "name": "김철수", "relation": "대학 동기", "birthday": "2003-03-14", "contact_cycle_days": 30, "note": null }
```

### 만남 기록

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/meetings` | 만남 목록 (최신순), `?person_id=1`로 특정 사람만 |
| POST | `/api/meetings` | 만남 추가 (`person_ids`에 함께한 사람 1명 이상) |
| GET | `/api/meetings/{id}` | 만남 상세 |
| PATCH | `/api/meetings/{id}` | 만남 수정 (보낸 항목만 변경) |
| DELETE | `/api/meetings/{id}` | 만남 삭제 |

```json
// POST /api/meetings
{
  "met_at": "2026-10-20T18:30:00",
  "place_name": "숭실대 정문",
  "latitude": 37.4963,
  "longitude": 126.9575,
  "memo": "요즘 클라이밍에 빠졌다고 함",
  "person_ids": [1, 2]
}
```

`place_name`이 `null`이면 장소 미지정, 위도·경도는 없으면 생략할 수 있습니다.

## 프로젝트 구조

```
backend/
  app/
    main.py          FastAPI 앱, 정적 파일 서빙
    models.py        DB 모델 (Person, Meeting)
    schemas.py       요청/응답 스키마
    routers/         API 라우터
  tests/
frontend/            index.html, app.js, style.css
data/                로컬 DB, 사진 (git 제외)
```

## 협업 규칙

- `main` 브랜치에 직접 push 하지 않고 `feature/<기능>` 브랜치에서 작업 후 PR
- 커밋 메시지: `feat:`, `fix:`, `docs:`, `test:`, `refactor:` 접두어 사용
- 이슈 단위로 작업하고 PR 본문에 `closes #이슈번호`

## 라이선스

MIT License. 참고한 오픈소스: [Monica](https://github.com/monicahq/monica) (AGPL-3.0, 코드는 사용하지 않고 기능 비교 대상으로만 참고)
