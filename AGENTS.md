# AGENTS.md — dsh-system-hud 项目规范（AI / 自动化代理）

本文件是**在这个仓库里工作时必须遵守的项目级规范**。全局规范见 `~/.dsh/AGENTS.md`；本文件只写项目特有约束。架构、视觉与取舍见 [`docs/DESIGN.md`](docs/DESIGN.md)，Host↔Client 协议见 [`docs/CONTRACT.md`](docs/CONTRACT.md)。

## 0. 一句话

DSH Web 插件：把本机 CPU / 内存 / 磁盘 / 网络 / I/O / 温度放进**三个原生位置**（对话顶栏入口、输入框底部 dock、侧边栏底部卡片），点开右侧「系统」详情。

**能力边界**：只读本机指标；不做进程 kill、不做磁盘清理、不做历史持久化（只保留 60s 内存缓冲）。macOS 温度拿不到时按设置策略渲染，绝不填 0 或假值。

## 1. 目录与职责

```
lib/index.js      Host 入口（/system-hud 路由、connection.admit 认证围栏、配置持久化）
lib/sample.js     分层采样器（快/慢/top、单飞、差分、暂停、失败保留旧值）
lib/metrics.js    平台解析与执行（darwin/linux 纯解析函数 + sampleFast/sampleSlow/identity）
lib/client.js     ModuleLoader bundle（三个位置、右侧系统 tab、设置页、i18n、样式）
cordis.patch.yml  bundle 补丁（插入 system-hud 行、默认配置）
scripts/smoke.mjs            离线冒烟（解析 fixture、单位换算、差分、配置合并）
scripts/check-i18n.mjs       zh/en 键一致 + 源码用键存在
scripts/release-notes.mjs    从 CHANGELOG 抽取当前版本作为 GitHub Release 正文
scripts/verify-plugin.mjs    插件标识一致性（包名/patch/ModuleLoader id/NS/路由），防改包名后宿主起不来
scripts/render-test.mjs      离线 UI 预览 + 本机 Chrome 截图
docs/CONTRACT.md             Host↔Client 协议（字段名/单位以它为准）
docs/DESIGN.md               架构、视觉规范、里程碑
docs/mockups / docs/screenshots
```

**约束**：Host 与 Client 不能互相 import；Client 不读文件/环境变量；跨端数据只走 `/system-hud` 的 JSON 协议。

## 2. 修改前必须做

1. `git status`、`git log --oneline -3` 确认工作区状态；
2. 改字段/单位先改 [`docs/CONTRACT.md`](docs/CONTRACT.md)，再同时改 Host 与 Client；
3. 改 UI 先对 `docs/mockups/` 的效果图，注意三处位置的宽度与折叠规则。

## 3. 提交前必须通过

```bash
npm run check        # 语法 + i18n 键一致性 + 插件标识一致性（verify）
npm run verify       # 包名 / cordis patch / ModuleLoader id / NS / 路由 一致性
npm run smoke        # 解析/差分/配置（不触网）
npm run test-ui       # 离线 UI 预览，截图自查
npm pack --dry-run   # 发布内容检查
```

CI 重复执行以上检查；失败不合并。

## 4. 安全不变量（不可破坏）

1. **命令白名单**：只允许 `sysctl`、`vm_stat`、`netstat -ibn`、`df -k`、`ioreg -rc IOBlockStorageDriver -w0`、`pmset -g therm`、`ps -Ao pcpu,pmem,rss,comm -r`；Linux 只读 `/proc/*`、`/sys/class/thermal/*`；
2. 一律 `execFile`（数组参数、2s 超时、`killSignal:'SIGKILL'`、maxBuffer 1MB），**禁止 shell 拼接**，禁止接受前端传入的命令/参数；
3. 路由复用 `connection.admit` 的 Host/Origin + Cookie 认证，未认证 401；
4. `$DSH_HOME/system-hud/config.json` 权限 0600、目录 0700，原子写，不存凭据；
5. 快照不包含用户名、绝对路径、环境变量；远端访问时 UI 显示「本机」而不是真实主机名。

## 5. UI 规范（DSH 原生）

- 只用 `--dsw-*` token，禁止硬编码色值（fallback 除外）；
- 文案全走 i18n（zh/en 键完全一致，`scripts/check-i18n.mjs` 强制）；
- ① 顶栏入口 ≤26px 高、约 170px 宽；② dock 用无边框 pill，和 token 统计同一行；③ 侧栏卡片 240px、3 环 + 一行摘要；
- 三个位置共享同一份快照与轮询，禁止各拉各的；
- 不可用指标按 `unavailable` 策略（hide / dash / proxy）渲染，stale 显示灰点与秒数。

## 6. 不要做的事

- 不要用 `ctx.connection.rpc.handle()`（web 组合下会失败），必须 `webServer.register` + `connection.admit`；
- 不要引入构建工具/打包器/运行时依赖（手写 ModuleLoader bundle 是刻意设计）；
- 不要在 `inject` 里放可选服务（用 `ctx.get` 宽松读取）；
- 不要在 Client 里 `setInterval` 之外再起轮询；不要每个位置各建 store；
- 不要重启 dsh 做 UI 自测（用 `npm run test-ui`）；不要提交 `*.tgz`、密钥、真实主机名/用户路径。

## 7. 版本与发布

- 版本号语义化；**发布只由 `v*` tag 触发**，禁止手动 `npm publish`；
- 每个版本必须更新 `CHANGELOG.md`（`## <semver> — <YYYY-MM-DD>`），Release 正文由它抽取；
- npm Trusted Publishing（OIDC）：PonyDevAI/dsh-system-hud + workflow `release.yml`；
- 提交信息用 Conventional Commits；作者使用全局 git config，不写 AI 署名。
