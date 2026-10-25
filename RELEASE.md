# 发布规范（自动发布 · Tag 触发）

本项目**不手动 `npm publish`**。发布唯一入口是**推送 `v*` tag**，由 GitHub Actions 自动完成。

## 链路

```
git push --follow-tags
        │
        ▼
GitHub Actions: .github/workflows/release.yml   (触发: push tags: v*)
  1. 校验 tag 与 package.json 版本一致（不一致 → 失败）
  2. 语法检查 + 冒烟测试 + i18n 键一致性
  3. npm Trusted Publishing（OIDC）发布，附 provenance
     - 版本已存在则跳过（幂等，可安全重跑）
  4. GitHub Release 正文 = CHANGELOG 当前版本条目
```

CI（`.github/workflows/ci.yml`）在 push `main` / PR 时只跑检查（语法 + 冒烟 + i18n + `npm pack` 内容校验），**不会发布**。

## CHANGELOG 与 Release 正文（强制）

- **每个版本必须在 `CHANGELOG.md` 有对应 `## <版本>` 条目**，缺失时 release workflow 直接失败（`scripts/release-notes.mjs`）；
- GitHub Release 正文 = 自动从 CHANGELOG 抽取当前版本条目，不手写；
- 分类固定：`新增` / `变更` / `修复` / `移除` / `安全`（无内容的分类省略）。

## 认证方式（OIDC，永不过期）

使用 **npm Trusted Publishing（OIDC）**，已配置（2026-10-24）：

| 项 | 值 |
|---|---|
| Package | `@ponydev/dsh-system-hud` |
| Organization or user | `PonyDevAI` |
| Repository | `PonyDevAI/dsh-system-hud` |
| Workflow filename | `release.yml` |
| 权限 | `publish`、`stage publish` |
| trust id | `26656b74-ebf5-4a49-b7b1-d4825b5520da` |

- **不需要** `NPM_TOKEN` secret、不需要 OTP、不会过期；
- 发布包自动获得 `dist.attestations.provenance`（SLSA v1）；
- `0.1.0` / `0.1.1` 是旧裸包 `dsh-system-hud` 的历史版本；
- `0.2.0` 起迁移到 `@ponydev/dsh-system-hud`，新包已单独配置 Trusted Publisher（id 见上表）；
- 旧裸包 `dsh-system-hud` 已从 npm **完全删除**（含 0.0.0-stage 与 0.1.x），包名已释放。

## 标准发版步骤

```bash
# 1. 更新 CHANGELOG.md（新增版本条目）与 package.json version
npm run check && npm run smoke
# 2. 提交并打 tag
git add -A && git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push --follow-tags
# 3. 验证
gh run watch --repo PonyDevAI/dsh-system-hud
npm view dsh-system-hud version
gh release view vX.Y.Z --repo PonyDevAI/dsh-system-hud
```

## 排障

- publish 步骤报 trusted publisher 错误：核对 repo / workflow 文件名 / environment 与 npm 设置完全一致；
- 版本已存在但 Release 没建：workflow 中 publish 会自动跳过，检查 CHANGELOG 是否缺当前版本条目；
- 需要临时救火时可在本地 `npm publish`（需要 2FA/OTP），事后仍以 tag 为唯一发版入口。
