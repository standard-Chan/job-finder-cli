# job-finder-cli

사용자 조건에 맞는 채용공고를 수집하고 추천하는 CLI입니다.

## 설치

```bash
npm install
```

## 실행

```bash
npm start
```

## 실행파일 만들기

```bash
npm run build:win    # dist/job-finder.exe
npm run build:mac    # dist/job-finder
npm run build:linux  # dist/job-finder
```

빌드 결과는 `dist/`에 생성됩니다. 실행할 OS에서 직접 빌드하는 것을 권장합니다.

## 생성 파일 사용

- `dist/`: 빌드된 실행파일 위치
- `data/`: 공고 DB가 저장되는 위치
- Windows: `dist/job-finder.exe` 실행
- Mac/Linux: `./dist/job-finder` 실행

Windows/WSL 실행 이슈는 `docs/실행.md`를 참고하세요.
