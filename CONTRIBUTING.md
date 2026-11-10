# 함께 작업하는 방법

프로젝트 규칙(기획 원칙, 디자인, 코드 규칙)은 [AGENTS.md](AGENTS.md)에 있어요. 이 문서는 GitHub로 같이 작업하는 절차예요.

## 처음 한 번

```bash
git clone https://github.com/xodbs126/drive-coach-demo.git
cd drive-coach-demo
git config core.autocrlf false     # 줄바꿈은 .gitattributes가 LF로 맞춰요
python -m http.server 8000         # http://localhost:8000
```

- 에디터는 `.editorconfig`를 지원하게 해 주세요(VS Code는 "EditorConfig for VS Code" 확장).
- AI 도구를 쓰면 저장소의 `AGENTS.md`를 읽게 해 주세요. Claude Code는 `CLAUDE.md`로 자동으로 읽고, Codex와 Cursor는 `AGENTS.md`를 바로 읽어요.

## 작업 흐름

1. **화면 담당을 나눠요.** 시작 전에 팀 채팅이나 GitHub Issue에 "A5 작업할게요"처럼 남겨요. `index.html` 하나에 모든 화면이 있어서, 같은 화면을 동시에 고치면 충돌이 나요.
2. **최신 main에서 브랜치를 만들어요.**
   ```bash
   git switch main
   git pull --rebase origin main
   git switch -c feat/a5-arrival-toast
   ```
   브랜치 이름: `feat/…` 새 기능, `fix/…` 버그, `docs/…` 문서, `refactor/…` 구조 정리
3. **작게 고치고 자주 커밋해요.** 관련 없는 줄의 포맷은 건드리지 않아요.
4. **확인해요.** 로컬 서버로 바뀐 화면을 직접 눌러 보고, 개발자 도구 콘솔에 에러가 없는지 봐요. A5를 고쳤으면 도착(B1 자동 이동)까지 재생해요.
5. **push하고 PR을 열어요.** PR 템플릿의 체크리스트를 채워요.
   ```bash
   git push -u origin feat/a5-arrival-toast
   ```
6. **팀원 한 명이 리뷰하고 승인하면** "Squash and merge"로 합쳐요. 합친 브랜치는 지워요.
7. main이 바뀌면 작업 중인 브랜치를 최신으로 맞춰요: `git pull --rebase origin main`

## 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 형식이에요.

```
type(scope): 요약 (한국어, 50자 안쪽, 마침표 없이)

본문(선택): 왜 바꿨는지, 무엇이 달라지는지
```

| type | 쓰는 경우 |
| --- | --- |
| `feat` | 화면, 기능, 문구 추가 |
| `fix` | 버그, 잘못된 수치·문구 수정 |
| `refactor` | 동작은 같고 구조만 바꿈 |
| `style` | 포맷, 들여쓰기만 바꿈 (동작·화면 변화 없음) |
| `docs` | README, AGENTS.md 등 문서 |
| `chore` | 설정 파일, 저장소 관리 |

**scope:** 화면 ID(`l0`, `a1`~`a5`, `b1`~`b4`, `c2`, `d2`~`d4`, `e2`, `e3`, `f2`, `f4`) 또는 `data` `sim` `tts` `3d` `ui` `panel`. 여러 화면에 걸치면 생략하거나 `ui`를 써요.

예시

```
feat(b1): 점수 미산출 예외 화면 추가
fix(data): 11/8 감점 합계를 86점에 맞게 수정
refactor(ui): index.html을 화면별 파일로 분리
docs: 협업 규칙 AGENTS.md 추가
```

## PR 규칙

- 한 PR에는 한 가지 목적만 담아요.
- 제목은 커밋 메시지 형식과 같아요(Squash 하면 제목이 그대로 커밋이 돼요).
- 화면이 바뀌면 전후 스크린샷을 붙여요.
- 기획 원칙(AGENTS.md)과 어긋날 수 있는 변경은 PR 설명에 이유를 적어요.
- 리뷰어는 기획 원칙, 시나리오 수치 일관성, 콘솔 에러를 중점적으로 봐요.

## 충돌이 났을 때

```bash
git pull --rebase origin main
# 충돌 파일을 열어 <<<<<<< ======= >>>>>>> 부분을 정리
git add <파일>
git rebase --continue
git push --force-with-lease
```

`index.html`의 긴 줄에서 충돌이 나면 혼자 정리하지 말고, 그 화면을 고친 팀원과 같이 봐요. `--force`가 아니라 `--force-with-lease`를 써요.

## 올리면 안 되는 것

- 기획서 원문과 내부 자료는 `docs/private/`에만 둬요(gitignore 대상).
- 개인 설정: `CLAUDE.local.md`, `.claude/settings.local.json`, `.vscode/`
