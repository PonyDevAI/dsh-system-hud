# Release

1. 更新 `CHANGELOG.md`（`## <semver> — <YYYY-MM-DD>`）。
2. `npm version <patch|minor|major>` 后推送 tag：`git push origin main --tags`。
3. GitHub Actions `release.yml` 校验 tag 与 `package.json` 一致、跑 check/smoke、用 Trusted Publishing 发布到 npm。
4. 不要手动 `npm publish`。
