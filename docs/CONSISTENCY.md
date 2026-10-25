# 与 `plugins/` 其他插件的规范对照

对照对象：`dsh-model-usage`、`dsh-phone`、`dsh-tailscale`（2026-10-25 现状）。✅ 一致 / ⚠️ 有意差异 / 🔧 本次对齐

| 维度 | 其他插件做法 | 本插件 | 结论 |
|---|---|---|---|
| 包名 | `@ponydev/dsh-<feature>` | `@ponydev/dsh-system-hud` | ✅ |
| 仓库结构 | `lib/` + `cordis.patch.yml` + `scripts/` + `docs/` + 根文档 | 同 | ✅ |
| 根文档 | AGENTS / CONTRIBUTING / RELEASE / CHANGELOG / README / LICENSE | 同 | ✅ |
| AGENTS.md | 0–7 节（一句话/目录/修改前/提交前/安全/UI/不要做/发布） | 同结构 | ✅ |
| scripts | `smoke` / `check-i18n` / `release-notes` / `render-test` | 同；命令名 `test-ui`（原 `render`） | 🔧 |
| package.json scripts | `check` / `smoke` / `check-i18n` / `release-notes` / `test-ui` | 同 | 🔧 |
| CI | `node --check lib/*.js` + smoke + i18n + `npm pack --dry-run` | 同（ci.yml 直接对齐 dsh-phone） | 🔧 |
| 发布 | `v*` tag + OIDC Trusted Publishing + `--provenance` + CHANGELOG 抽正文 + GitHub Release | 原为 `NPM_TOKEN`，已改 | 🔧 |
| engines | `dsh >=0.2.0-rc.2 <0.3.0`（+ node >=22.5） | 同 | ✅ |
| Host 注册 | `export function apply(ctx, rawConfig)` + `cordis.patch.yml insert` | 同 | ✅ |
| Host 路由 | `webServer.register({kind:'prefix'})` + `connection.admit`，未认证 401 | 同 | ✅ |
| 响应协议 | `{ok:true,value}` / `{ok:false,error:{code,message}}`，业务错误 HTTP 200 | 同 | ✅ |
| 配置持久化 | `$DSH_HOME/<plugin>/*.json`，0600 / 原子写 | 同（目录 0700） | ✅ |
| 子进程 | 白名单 + `execFile`，不拼接 shell | 同（2s 超时 / 1MB / SIGKILL） | ✅ |
| Client 格式 | 手写 `window.__ModuleLoader__.load({id,factory})`，无构建 | 同 | ✅ |
| Client 取数 | 相对路径 `fetch('<route>/<endpoint>')` | 同 | ✅ |
| i18n | NS = 包名，zh/en 键一致，`check-i18n` 强制 | 同（162 键） | ✅ |
| Settings 页 | 标题 + 版本 + GitHub / 问题反馈 / 检查更新；更新弹窗 | 同；额外「恢复默认」 | ✅/⚠️ |
| Settings 控件 | `dsh-model-usage` 用 primitives（Button/Switch/SegmentedTabs/Modal） | 同（Switch 已改用 `P.Switch`） | 🔧 |
| Settings 图标 | usage 自绘图标、tailscale 无图标 | 用 primitives `IconGaugeOutlineRegular` | ⚠️ 合理 |
| 检查更新 | `update-check` endpoint + registry 缓存 + 手工更新命令 | 同；404 显示「尚未发布」而非报错 | ✅/⚠️ |
| 右侧栏 tab | `sidebarRightTabs.register({id,kind,title})` | 同 | ✅ |
| CSS class 前缀 | `dmu-` / `dph-` / `dst-` | `huds-` | ⚠️ 功能无影响，可改 |
| Token | 只用 `--dsw-*` | 同（全部带 fallback） | ✅ |
| 测试 | smoke + i18n + 离线 UI harness（phone）/ 无（usage） | smoke 38 条 + i18n + harness 5 断言 | ✅ |
| 文档 | DESIGN（+ 视情况 providers/architecture） | DESIGN + CONTRACT（多一份协议文档） | ✅ |

## 保留差异及理由

1. **CSS 前缀 `huds-`**：不做 3 字母缩写（`dsh-` 与宿主类名可能冲突）；如要与 `dmu-/dph-/dst-` 完全一致，可机械重命名为 `dsy-`，但收益仅是命名统一。
2. **设置页多一个「恢复默认」**：本插件配置项比额度插件多（位置/指标/采样/阈值），一键还原有用；`dsh-tailscale` 也在 actions 里放了额外按钮。
3. **`404 → 尚未发布`**：其他插件会显示 `检查失败：HTTP 404`；本插件是本地 `link:` 安装，语义化更准确。
4. **更新弹窗同时支持 `P.Modal` 与自绘浮层**：`dsh-model-usage` 依赖 `P.Modal`；本插件保留无 primitives 环境的降级路径（离线 harness 用）。

## 验证命令

```bash
npm run check      # 语法 + i18n 162 键
npm run smoke      # 38/38
npm run test-ui    # 离线渲染 + 5 断言 + 截图
node scripts/release-notes.mjs /tmp/notes.md
npm pack --dry-run
```
