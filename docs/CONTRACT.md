# Host ↔ Client 契约（dsh-system-hud v0.1）

本文件是两个半区唯一的接口约定。Host（`lib/index.js`、`lib/sample.js`、`lib/metrics.js`）与 Client（`lib/client.js`）**只能**通过这里定义的 HTTP JSON 协议交互，不得互相 import。

## 1. 传输

- 路由前缀 `system-hud`，由 Host 用 `ctx.webServer.register({ kind:'prefix', path:'/system-hud' })` 注册，每个请求第一行做 `ctx.connection.admit(req)` 认证围栏；未认证返回 `401`，被拒返回 `403`。
- Client 用相对路径请求：`fetch('system-hud/' + endpoint, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint, payload }) })`。
- 统一响应：成功 `{ ok: true, value: <any> }`；失败 `{ ok: false, error: { code, message } }`，HTTP 状态码 200（业务错误）或 4xx/5xx（协议错误）。
- 只接受 `POST`（`GET` 一律 405，方便排查）。请求体上限 1 MiB。

## 2. endpoints

| endpoint | payload | 返回 value |
|---|---|---|
| `snapshot` | `{}` | 见 §3 快照 |
| `config` | `{}` | 见 §4 配置 |
| `save-config` | 部分配置对象（深合并） | 合并后的完整配置 |
| `refresh` | `{}` | 强制重采后的 `snapshot` 值 |

## 3. 快照（snapshot）

```jsonc
{
  "timestamp": 1761340800123,        // 本机时钟 ms
  "monotonicMs": 812341,             // 进程内单调时钟，用于差分
  "intervalMs": 1000,                // 快层周期
  "host": {
    "name": "Mac Studio",            // 仅用于本机展示；远端访问时不外泄主机名（见 §6）
    "platform": "darwin",            // darwin | linux | other
    "chip": "Apple M1 Max",          // 可选，取不到为 null
    "cores": 10,
    "uptimeSec": 738000,
    "sampledAt": 1761340800000
  },
  "cpu": {
    "usagePercent": 71.2,            // 0-100，1 位小数；首帧无前值为 null
    "perCore": [38.0, 62.4],         // 长度 = cores
    "load": [2.31, 2.10, 1.98],      // 1/5/15
    "sampledAt": 1761340800000
  },
  "memory": {
    "usedBytes": 26424115200,
    "totalBytes": 34359738368,
    "cacheBytes": 1572864000,        // 可选
    "swapUsedBytes": 1288490188,
    "sampledAt": 1761340800000
  },
  "disk": {
    "usedBytes": 1082331758592,
    "totalBytes": 2000398934016,
    "freeBytes": 870000000000,       // 可选；APFS 用 total-used 或 free 之一，二者必须自洽
    "readBytesPerSec": 161480704,
    "writeBytesPerSec": 38692454,
    "readTotalBytes": 106945000000000,
    "writeTotalBytes": 67900000000000,
    "sampledAt": 1761340800000
  },
  "network": {
    "rxBytesPerSec": 5872025,
    "txBytesPerSec": 11010048,
    "rxTotalBytes": 10335409301094,
    "txTotalBytes": 5712000000000,
    "sampledAt": 1761340800000
  },
  "temperature": {
    "available": false,              // 取不到时必须 false，禁止填 0
    "reason": "needs-helper",        // needs-helper | unsupported | error
    "cpuC": null, "ssdC": null, "ambientC": null, "source": null,
    "pressureLevel": null,           // nominal | fair | serious | critical | null（pmset -g therm 解析，多数机器 null）
    "sampledAt": 1761340800000
  },
  "processes": [                     // 取不到为 null
    { "name": "node", "cpuPercent": 38.2, "memoryBytes": 4404019200 }
  ],
  "power": { "watts": 28 } | null,   // 取不到为 null
  "warnings": []                     // 非致命错误，字符串数组（给设置页诊断）
}
```

规则：

- 每个 section 都自带 `sampledAt`；Client 用它算 stale，不要求所有 section 同一时刻。
- **首帧**（启动后 ≤1 个 `fastMs`）`cpu.usagePercent` 与 4 个 `*BytesPerSec` 为 `null`（没有前值可差分），Client 必须按「—」渲染，不要当 0。
- 某个 section 采样失败：**保留上一次成功值**并 `warnings.push(...)`，同时把该 section 的 `sampledAt` 停在旧值；超过 3 个快层周期未更新即视为 stale。
- 所有字节字段是 number（可能很大，JS 安全整数内）。
- 快照禁止包含用户名、绝对路径、主机名以外的隐私信息；`host.name` 在远端访问时由 Client 显示为「本机」。

## 4. 配置（config）

```jsonc
{
  "fastMs": 1000,                    // 1000 | 2000 | 5000
  "slowMs": 5000,                    // 5000 | 10000 | 30000
  "topProcMs": 30000,                // 0 = 关闭
  "regions": {
    "header": true,                  // conversation.session.header.utilities
    "dock": true,                    // conversation.composer.dock
    "sidebar": true,                 // sidebar.footer.action
    "rightPane": true,               // sidebar.right.pane.tab
    "bottomBar": false               // shell.bottom（备选，默认关）
  },
  "metrics": {                       // 指标开关与顺序；数组顺序即显示顺序
    "order": ["cpu", "memory", "disk", "network", "io", "temperature"],
    "hidden": ["load", "processes"]
  },
  "unavailable": "hide",             // hide | dash | proxy
  "thresholds": { "warn": 60, "crit": 85, "tempC": 90 },
  "units": "bytes",                  // bytes | bits
  "showTotals": true,
  "hoverDelayMs": 300,
  "clickAction": "pane"              // pane | card
}
```

- `save-config` 做深合并，持久化到 `$DSH_HOME/system-hud/config.json`（目录 0700、文件 0600），失败也要返回内存中生效的配置 + `warnings`。
- 配置非法值（负数、未知键值）一律回退默认值，不抛错。

## 5. 采样分层（Host）

| 层 | 内容 | 周期 | 依据 |
|---|---|---|---|
| fast | CPU（进程内 `os.cpus()` 差分）、网络 `netstat -ibn` 差分 | `fastMs` | 实测 ≈6ms/轮 |
| slow | 内存 `vm_stat` + `sysctl`、磁盘 `df -k`、磁盘 IO `ioreg` 差分、温度 | `slowMs` | 每条 6–22ms |
| top | Top 进程（`ps`，取不到则 null） | `topProcMs` | 实测 ~30ms，失败降级 |
| once | 机型/核数/开机时间 `sysctl` | 进程启动一次 + 60s 兜底 | — |

- 命令白名单写死：`sysctl`、`vm_stat`、`netstat -ibn`、`df -k`、`ioreg -rc IOBlockStorageDriver -w0`、`pmset -g therm`、`ps -Ao pcpu,pmem,rss,comm -r`、`sysctl -n kern.boottime`；Linux 只读 `/proc/*` 与 `/sys/class/thermal/*`，另加 `df -k`。
- 绝不把前端传入的字符串拼进命令；每个 execFile 都有 2s 超时与 `killSignal:'SIGKILL'` 兜底。
- 采样只在「至少一个区域启用」且最近 30s 内有 `snapshot` 请求时运行；无订阅者 60s 后自动暂停（Client 重新请求即恢复）。

## 6. Client 规则

- 三个位置分别注册：`conversation.session.header.utilities`、`conversation.composer.dock`、`sidebar.footer.action`；右栏用 `ctx.sidebarRightTabs.register({ id:'system-hud', kind:'system-hud', title })`；设置页用 `ctx.slots` 的 `settings.section`。
- 单个 1s 轮询（`fetch('system-hud/snapshot')`），三个位置共享同一份快照；`document.visibilityState !== 'visible'` 时暂停。
- 主题只用 `--dsw-*` token；不硬编码颜色（fallback 值除外）。
- 文案全部走 i18n（NS `dsh-system-hud`，zh/en 键完全一致）。
- 位置开关、指标顺序、不可用策略等写回 `save-config`，本地不持久化（Host 是唯一真相源）。
