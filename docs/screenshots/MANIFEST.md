# 截图来源登记（MANIFEST）

`docs/screenshots/` 下的每张图都必须在这里登记「文件 ← 生成脚本」，并由 `node scripts/check-shots.mjs` 强制：

- 只能由 `scripts/` 下的离线 harness 用**假数据**生成；禁止真机 / 真实账户截图。
- 示例机型统一为 `Example Mac` / `Apple M2 Pro` / `macOS 15.0`（见 `scripts/render-test.mjs` 的 `FIXTURE`）。
- 新增、替换或删除截图时同步更新本文件，否则 `npm run check` 失败。

## 登记

- `docs/screenshots/01-regions.png` ← `scripts/render-test.mjs`
- `docs/screenshots/02-settings.png` ← `scripts/render-test.mjs`

## 生成方式

```bash
npm run test-ui     # = node scripts/render-test.mjs（本机 Chrome 无头截图）
```

## 已删除（不要再提交）

真机运行截图与旧效果图（`03-live-hero.png`…`07-live-settings-nav.png`、`docs/mockups/**/*.png`）印有真实机型与真实会话标题，2026-10 隐私清理时删除；需要效果图时必须先用假数据重新生成并在本文件登记。
