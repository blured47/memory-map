# Memory Map — 개인 인간관계 기억지도

사진과 자유 메모만 올리면 만남 장소·시간·대화 내용이 사람별로 정리되고, 지도 위에 시각화되며,
평소보다 오래 연락하지 못한 사람을 알려주는 아이폰 앱입니다.

> 오픈소스기초및설계 3반 9조 — 안태현, 최연성, 임지수

## 개발 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 사람 등록, 만남 기록 CRUD | 완료 |
| 2 | 카카오맵 연동 (장소·동네 검색, 기억지도, 내 위치) | 완료 |
| 3 | 사진 EXIF 기반 자동 기록 (Pillow) | 완료 (실기기 확인 필요) |
| 4 | AI 메모 자동 분류 (Ollama), 맞춤형 연락 알림, 친구 생일·메모 | 완료 (앱에서 메모 정리 → 친구별 AI 카드) |
| 5 | 통합 테스트, 정확도 검증 | 완료 (전체 흐름 통합 테스트, 메모 분류 F1 90%·생각 모드 93%) |

## 기술 스택

- 백엔드: Python, FastAPI, SQLAlchemy, SQLite
- 앱: React Native (Expo), 카카오맵 JavaScript SDK (WebView)
- 사진 처리: Pillow (EXIF)
- AI: Ollama (로컬 LLM — 메모는 외부로 전송하지 않음)
- 배포: Docker

## 실행 방법

서버를 먼저 켜고 아이폰 앱을 연결합니다. 앱 실행 방법은 [frontend/README.md](frontend/README.md)를 보세요.

> 앱 명령(`npm install`, `npx expo start`)은 반드시 `frontend/` 폴더에서 실행합니다. 루트에서 실행하면 `ConfigError: The expected package.json path ... does not exist` 오류가 납니다.

### 서버 (Python 3.12+)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # 카카오 REST 키 입력
cd backend && uvicorn app.main:app --reload --host 0.0.0.0
```

아이폰이 접속할 수 있도록 `--host 0.0.0.0` 으로 켭니다. 서버에는 로그인 기능이 없어 같은 네트워크의 누구나 기록을 볼 수 있으니 믿을 수 있는 네트워크에서만 켜세요.

API 문서는 http://localhost:8000/docs 에서 볼 수 있습니다.

### 서버 (Docker)

```bash
cp .env.example .env
docker compose up --build
```

### 테스트

```bash
cd backend && pytest
```

`tests/test_integration.py` 는 사진 업로드 → 친구 등록 → 만남 기록 → AI 메모 분류 → 카드 수정 → 연락 알림 → 삭제·복구까지 앱의 전체 흐름을 한 번에 확인하는 통합 테스트입니다. AI(Ollama)는 가짜 응답으로 바꿔서 실행하므로 Ollama 없이도 돌아갑니다.

### AI 메모 분류 정확도 측정

Ollama를 켠 상태에서 예시 메모 30개(`backend/evaluation/memos.json`)를 분류해 미리 적어 둔 정답과 비교합니다. 결과는 `results/` 에 저장됩니다.

```bash
cd backend && python -m evaluation.evaluate            # 30개 전부
cd backend && python -m evaluation.evaluate --limit 3  # 앞의 3개만 빠르게
```

| 모드 | F1 | 메모당 시간 | 결과 |
|---|---|---|---|
| 빠른 모드 (기본) | 90% | 약 11초 | [results/memo-accuracy-before.md](results/memo-accuracy-before.md) |
| 생각 모드 (`OLLAMA_THINK=1`) | 93% | 약 50초 | [results/memo-accuracy-think.md](results/memo-accuracy-think.md) |

빠른 모드에 규칙을 더 넣은 프롬프트는 F1 88%로 오히려 떨어져 쓰지 않습니다 ([results/memo-accuracy-after.md](results/memo-accuracy-after.md)).

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

### 사진

| 메서드 | 주소 | 설명 |
|---|---|---|
| POST | `/api/photos` | 사진 업로드 (`file`, 20MB 이하, HEIC 지원) → 촬영 시각 `taken_at`, 위도·경도, `photo_path` 반환 |
| GET | `/api/photos/{photo_path}` | 저장된 사진 (WebP, 위치 정보 제거됨) |

EXIF가 없는 사진은 `taken_at`, 위도·경도가 `null`이므로 직접 입력합니다. 만남에 사진을 붙일 때는 받은 `photo_path`를 `POST /api/meetings`에 함께 보냅니다.

### 장소 (카카오 로컬 API)

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/places/nearby?lat=&lon=` | 좌표의 주소와 주변 장소 후보 (가까운 순) |
| GET | `/api/places/search?query=` | 장소 검색. 동네·주소와 맞는 지역(예: 양천구, 인계동)이 먼저, 이어서 키워드 장소 (`lat`, `lon`을 주면 장소는 가까운 순) |

`.env`에 `KAKAO_REST_KEY`(카카오 **REST API 키**, 앱의 JavaScript 키와 다름)가 있어야 합니다. 키를 바꾸면 서버를 다시 켭니다.

### 연락 알림

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/reminders?ratio=1.5` | 평소 주기의 `ratio`배를 넘겨 만나지 못한 사람 (오래 못 본 순) |

평소 주기(`usual_cycle_days`)는 만남 간격의 평균이고, 만난 날이 3일 미만이면 사용자가 지정한 `contact_cycle_days`를 씁니다. 사람 조회 결과에 `days_since_last_met`, `overdue_ratio`, `needs_contact`도 함께 나옵니다.

### 메모 분류 (AI)

| 메서드 | 주소 | 설명 |
|---|---|---|
| POST | `/api/meetings/{id}/classify` | 만남 메모를 AI로 분류해 사람별 카드에 저장 (다시 실행하면 새로 분류, 20초 안팎 소요) |
| GET | `/api/persons/{id}/card` | 사람별 카드: 관심사, 추천받은 내용, 다음에 물어볼 내용, 기념일 |
| PATCH | `/api/memo-items/{id}` | 분류 결과 수정 |
| DELETE | `/api/memo-items/{id}` | 분류 결과 삭제 |

메모 분류를 쓰려면 [Ollama](https://ollama.com)를 설치하고 모델을 받아둡니다. 메모는 내 컴퓨터의 Ollama로만 전송됩니다.

```bash
ollama pull qwen3:8b
ollama serve
```

서버 `.env` 에 `OLLAMA_THINK=1` 을 넣으면 생각 모드로 분류합니다. 정확도는 조금 오르지만 메모당 1분 가까이 걸립니다. 모델과 주소는 `OLLAMA_MODEL`, `OLLAMA_URL` 로 바꿀 수 있습니다.

앱에서는 만남을 메모와 함께 저장하면 저장은 바로 끝나고, 메모 분류는 뒤에서 자동으로 진행됩니다 (화면 아래에 "AI가 메모 분류 중…" 표시). 결과는 친구 화면의 **AI 카드**에서 보고 고칩니다.

## 프로젝트 구조

```
backend/
  app/
    main.py          FastAPI 앱
    models.py        DB 모델 (Person, Meeting, MemoItem)
    memo_ai.py       Ollama 메모 분류
    schemas.py       요청/응답 스키마
    routers/         API 라우터
  tests/             단위 테스트, 통합 테스트(test_integration.py)
  evaluation/        AI 메모 분류 정확도 측정
frontend/            아이폰 앱 (React Native, Expo)
  App.js             지도 화면
  src/               화면별 시트, API, 테마(theme.js)
data/                로컬 DB, 사진 (git 제외)
results/             AI 메모 분류 정확도 측정 결과
```

## 협업 규칙

- `main` 브랜치에 직접 push 하지 않고 `feature/<기능>` 브랜치에서 작업 후 PR
- 커밋 메시지: `feat:`, `fix:`, `docs:`, `test:`, `refactor:` 접두어 사용
- 이슈 단위로 작업하고 PR 본문에 `closes #이슈번호`

## 라이선스

MIT License. 참고한 오픈소스: [Monica](https://github.com/monicahq/monica) (AGPL-3.0, 코드는 사용하지 않고 기능 비교 대상으로만 참고)
