# 기여 가이드

이 문서는 **맡은 이슈를 받은 뒤, 결과물을 저장소에 올리는 방법**을 설명합니다.

## 전체 흐름 한눈에 보기

```
① 이슈 확인  →  ② 작업  →  ③ 파일 올리기 + PR 만들기  →  ④ 리뷰 받고 합치기
 (할 일 읽기)    (내 컴퓨터)     (GitHub에 제출)                (최연성이 머지)
```

- **이슈(Issue)**: "이거 해주세요"라는 할 일 카드. 저장소의 **Issues** 탭에 있습니다.
- **PR(Pull Request)**: "제가 한 작업을 프로젝트에 합쳐주세요"라는 제출 요청. 과제 제출 버튼이라고 생각하면 됩니다.
- **브랜치(Branch)**: 내 작업용 복사본. 여기서 작업하면 원본(`main`)이 망가지지 않습니다.

PR이 합쳐지면 **내 이름으로 기여 기록이 남습니다.** (평가에 반영되는 부분)

---

## 방법 1. 웹사이트에서만 하기 (추천 — 설치 필요 없음)

사진, 메모 JSON, 문서처럼 **파일을 추가하는 작업**은 이 방법으로 충분합니다.

### 예시: "테스트 사진 수집" 이슈를 끝냈을 때

1. 저장소 페이지에서 올릴 폴더로 이동합니다. (예: `backend` → `tests`)
2. 오른쪽 위 **Add file** → **Upload files** 클릭
   - 폴더가 아직 없으면 **Add file → Create new file**을 누르고 이름 칸에 `fixtures/photos/README.md`처럼 `/`를 넣어 쓰면 폴더가 만들어집니다.
3. 파일을 끌어다 놓습니다.
4. 아래 **Commit changes** 칸에서
   - 첫 줄(메시지): `test: EXIF 테스트용 사진 추가` 처럼 무엇을 했는지 한 줄
   - **"Create a new branch for this commit and start a pull request"** 선택 ← 꼭 이걸로!
   - 브랜치 이름: 이슈에 적힌 이름 (예: `test/exif-photos`)
5. **Propose changes** → 다음 화면에서 **Create pull request**
6. PR 본문에 `closes #3`처럼 이슈 번호를 적으면, 합쳐질 때 이슈가 자동으로 닫힙니다.

끝입니다. 이후 리뷰 댓글이 달리면 확인하고, 수정이 필요하면 같은 브랜치에 다시 업로드하면 됩니다.

---

## 방법 2. 터미널로 하기

코드를 실행해봐야 하는 작업(Ubuntu 설치 검증, 테스트 코드 작성)은 이 방법을 씁니다.

### 처음 한 번만

```bash
git clone <저장소 주소>                    # 저장소를 내 컴퓨터로 복사
cd memory-map
python3 -m venv .venv                      # 이 프로젝트 전용 파이썬 환경 만들기
source .venv/bin/activate                  # 그 환경 켜기 (터미널 열 때마다)
pip install -r backend/requirements.txt    # 필요한 라이브러리 설치
```

실행 확인: `cd backend && uvicorn app.main:app --reload` → 브라우저에서 http://localhost:8000

### 작업할 때마다

```bash
git switch main && git pull               # 1. 최신 상태로 맞추기
git switch -c test/exif-cases             # 2. 내 작업 브랜치 만들기 (이름은 이슈에 적혀 있음)

# ... 파일 작업 ...

git add backend/tests/test_exif.py        # 3. 올릴 파일 고르기
git commit -m "test: EXIF 예외 처리 테스트 추가"   # 4. 저장 (메시지는 한 줄 설명)
git push -u origin test/exif-cases        # 5. GitHub에 올리기
```

올린 뒤 저장소 페이지에 노란 **Compare & pull request** 버튼이 뜹니다 → 눌러서 PR 생성 (본문에 `closes #이슈번호`).

---

## 다른 사람 PR 리뷰하기

1. 저장소 **Pull requests** 탭 → 리뷰할 PR 클릭
2. **Files changed** 탭에서 바뀐 내용 확인
   - 궁금한 줄 옆 **+** 를 눌러 댓글 (예: "이 부분은 왜 필요한가요?")
3. 오른쪽 위 **Review changes** → 문제 없으면 **Approve** → **Submit review**

코드를 전부 이해하지 않아도 됩니다. "실행해봤는데 잘 됩니다" 또는 질문 한 줄도 좋은 리뷰입니다.

---

## 막혔을 때

| 상황 | 해결 |
|---|---|
| `main`에 바로 올려버렸다 | 괜찮습니다. 단톡방에 알려주세요. |
| `git push`에서 비밀번호/인증 오류 | GitHub는 비밀번호 대신 토큰이 필요합니다. 방법 1(웹 업로드)을 쓰거나 단톡방에 물어봐 주세요. |
| `pip install` 오류 | 에러 메시지 전체를 복사해서 **새 이슈**로 올려주세요. 이것도 기여입니다. |
| 뭘 해야 할지 모르겠다 | 맡은 이슈에 댓글로 질문해 주세요. |

## 지켜주세요

- **`main`에 직접 올리지 않기** — 항상 새 브랜치 + PR
- **`.env` 파일은 올리지 않기** — 카카오 API 키가 들어 있습니다
- **실제 개인정보 올리지 않기** — 저장소는 공개됩니다. 집에서 찍은 사진(위치 정보 포함), 실제 지인 대화는 X
