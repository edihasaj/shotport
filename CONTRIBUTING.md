# Contributing to shotport

Thanks for taking a look. shotport is small and opinionated — contributions that keep it that way are welcome.

## Wedge

shotport is **the token-cheap screenshot layer for coding agents**. Text first, budgeted pixels only when needed. It is not a general image library, not a vision pipeline, not a scraping framework. Keep PRs aligned with that wedge:

- Cheaper, more accurate text extraction (accessibility, OCR fallbacks).
- Smarter token budgeting and image resizing.
- New capture backends that follow the graceful-degradation contract (a missing backend returns a clean note, never a crash).
- Cleaner agent surfaces — stable stdout summary line, stable `--json` shape.

## Requirements

- [Bun](https://bun.sh) 1.1+
- macOS or Linux

## Build & test

```sh
bun install
bun test
bun run typecheck
bun run build
```

Smoke the built binary:

```sh
./dist/shotport browser https://example.com --text-only
```

## PR checklist

- [ ] `bun test` passes.
- [ ] `bun run typecheck` is clean.
- [ ] `bun run build` produces a working binary.
- [ ] New backends degrade gracefully when the underlying tool is absent (return a note, don't throw).
- [ ] If you changed the stdout summary line or `--json` shape, update `README.md` and the relevant test.
- [ ] Conventional commit subject (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`).
- [ ] No `--no-verify`, no `--amend` of pushed commits.

## Style

- Telegraph-style commit bodies — say *what* and *why*, skip filler.
- Keep files under ~500 LOC; split modules instead of monoliths.
- No comments restating the code; only document non-obvious *why*.
- Tests live in `tests/` next to the behavior they cover. Backends are tested through the injectable runner in `tests/mockRunner.ts` — no real subprocesses in unit tests.

## Reporting bugs

Use the issue templates. For capture bugs, include:

- OS + version (`sw_vers -productVersion` on macOS).
- The exact `shotport` command you ran.
- Which backends are installed (`abx`, `guiport`, `tesseract`, `cwebp`).
- The full stdout, including any `*_not_granted` / `*_missing` notes.

## Security

See [`SECURITY.md`](SECURITY.md). Don't open public issues for security reports.

## License

MIT. By contributing you agree your contributions are licensed under MIT.
