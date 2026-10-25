# Contributing

1. `npm run check && npm run smoke` 必须通过；改 UI 再跑 `npm run test-ui` 自查截图。
2. 改协议字段先改 `docs/CONTRACT.md`，Host/Client 同步改。
3. 提交信息用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:`）。
4. 不要提交密钥、真实主机名/路径、`*.tgz`。
5. **截图只能由离线 harness（`scripts/render-test.mjs`）用假数据生成**，不得提交真机 / 真实账户截图；新增或更换截图必须在 `docs/screenshots/MANIFEST.md` 登记「文件 ← 生成脚本」。
6. 提交前必须跑 `npm run check`（其中包含 `scripts/check-privacy.mjs` 与 `scripts/check-shots.mjs` 两道隐私门禁）。
