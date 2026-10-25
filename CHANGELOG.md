# Changelog

## 0.1.0 — 2026-10-25

首个可用版本（M1）。

### 与其他插件规范对齐（2026-10-25）

- 脚本命名统一为 `test-ui`，新增 `release-notes`
- 发布工作流改为 OIDC Trusted Publishing（去掉 `NPM_TOKEN`）+ CHANGELOG 抽正文 + GitHub Release
- CI 直接对齐 `dsh-phone`
- 设置页 switch 改用 DSH primitives `P.Switch`；设置页图标用 `IconGaugeOutlineRegular`
- README 补齐「功能特性 / 已知限制 / 检查更新 / 安全 / 结构」章节；新增 `docs/CONSISTENCY.md` 对照表

### 设置页

- 顶部按其他插件规范补齐：标题图标 + 版本号、GitHub、问题反馈、检查更新、恢复默认；
- Host 新增 `update-check`（npm registry，10 分钟缓存，404 视为「尚未发布」）；
- 设置页控件统一走 DSH primitives（Button / Switch / SegmentedTabs / Modal），只用 `--dsw-*` token。

### 新增

- Host 半区：`/system-hud` 前缀路由（`snapshot` / `config` / `save-config` / `refresh`），`connection.admit` 认证围栏，配置持久化到 `$DSH_HOME/system-hud/config.json`（0600，原子写）。
- 分层采样：快层（CPU + 网络，默认 1s）、慢层（内存 / 磁盘 / 磁盘 IO / 温度，默认 5s）、Top 进程（默认 30s）；累计量差分、单飞、失败保留旧值、无订阅者暂停。
- 平台支持：macOS（`vm_stat` / `netstat -ibn` / `df -k` / `ioreg` / `sysctl` / `ps`）与 Linux（`/proc/stat`、`/proc/meminfo`、`/proc/net/dev`、`/sys/class/thermal`）。
- Client 半区：三个原生位置（`conversation.session.header.utilities`、`conversation.composer.dock`、`sidebar.footer.action`）、右侧「系统」tab（`sidebar.right.pane.tab`）、设置页（`settings.section`）。
- 设置项：三个位置 + 备选底栏开关、指标开关与顺序、不可用数据策略（隐藏 / 显示 — / 代理）、采样周期、阈值与颜色、点击行为、悬停延时。
- 状态处理：`sampledAt` 计算 stale；温度不可用在 macOS 上按策略渲染，不填 0。
- 真实宿主验证：在隔离 `DSH_HOME` 启动 `dsh web`，`/system-hud/snapshot` 返回真实指标（未认证 401），浏览器加载客户端 bundle 后侧栏卡片正常渲染（`docs/screenshots/03-live-hero.png`）。
- 工程：`npm run check`（语法 + i18n 键一致）、`npm run smoke`（离线解析/差分/配置）、`npm run render`（离线 UI 预览 + 截图）、CI 与 tag 发布工作流。
