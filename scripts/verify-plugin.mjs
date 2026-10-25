// 插件标识一致性校验（防「改包名/改 id 后 DSH 起不来」）
// 校验：包名 / exports / cordis.patch 行 / ModuleLoader id / host name / i18n NS / 路由 / 配置目录 / slot id
// 用法：node scripts/verify-plugin.mjs（CI 与 npm run check 都会跑）
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const root = new URL('..', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
const patchText = readFileSync(new URL('cordis.patch.yml', root), 'utf8')
const hostSrc = readFileSync(new URL('lib/index.js', root), 'utf8')
const clientSrc = readFileSync(new URL('lib/client.js', root), 'utf8')

let failures = 0
const ok = (name, condition, detail) => {
  if (condition) return
  failures += 1
  console.error('FAIL  ' + name + (detail === undefined ? '' : '\n  ' + JSON.stringify(detail)))
}
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) return
  failures += 1
  console.error('FAIL  ' + name + '\n  expected ' + b + '\n  actual   ' + a)
}

// ---------- 包名：必须是 scoped 的 @ponydev/dsh-<slug>
const scoped = /^@([a-z0-9-]+)\/(dsh-[a-z0-9-]+)$/.exec(pkg.name || '')
ok('package.name 形如 @ponydev/dsh-<slug>', !!scoped, pkg.name)
const owner = scoped ? scoped[1] : ''
const pkgSlug = scoped ? scoped[2] : ''
const slug = pkgSlug.replace(/^dsh-/, '')
eq('package.name scope', owner, 'ponydev')
ok('slug 只含小写字母/数字/连字符', /^[a-z0-9-]+$/.test(slug), slug)

// ---------- exports：Host 入口与 Client 入口
eq('exports["."] 指向 Host', pkg.exports && pkg.exports['.'], './lib/index.js')
eq('exports["./client"] 指向 Client', pkg.exports && pkg.exports['./client'], './lib/client.js')
ok('files 包含 lib', Array.isArray(pkg.files) && pkg.files.includes('lib'), pkg.files)
ok('engines.dsh 声明', !!(pkg.engines && pkg.engines.dsh), pkg.engines)
ok('dsh.bundle.patch 指向 cordis.patch.yml', !!(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch), pkg.dsh)

// ---------- cordis.patch.yml：只插一行；id 是短 slug；name 必须是完整包名
const rowIds = [...patchText.matchAll(/^\s*-\s*id:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => m[1])
eq('patch 只插入一行', rowIds.length, 1)
eq('patch 行 id = slug（不带 scope）', rowIds[0], slug)
const rowName = [...patchText.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => m[1])[0]
eq('patch 行 name = package.name（必须带 scope）', rowName, pkg.name)
ok('patch 行 id 不含 @ 或 /', rowIds[0] === slug && !/[@/]/.test(rowIds[0] || ''), rowIds[0])

// ---------- Host：name / apply / 路由 / 配置目录 / 更新命令
const hostName = (/export const name = '([^']+)'/.exec(hostSrc) || [])[1]
ok('host name 是 dsh-<slug> 或完整包名', hostName === 'dsh-' + slug || hostName === pkg.name, hostName)
ok('host 导出 apply(ctx, rawConfig)', /export function apply\s*\(/.test(hostSrc))
const route = (/path: '\/([a-z0-9-]+)'/.exec(hostSrc) || [])[1]
eq('HTTP 路由 = /<slug>', route, slug)
const cfgDir = (/join\(home, '([a-z0-9-]+)'\)/.exec(hostSrc) || [])[1]
eq('配置目录 = $DSH_HOME/<slug>', cfgDir, slug)
const pkgNameConst = (/const PKG_NAME = '([^']+)'/.exec(hostSrc) || [])[1]
eq('Host 内 PKG_NAME = package.name', pkgNameConst, pkg.name)
ok('更新命令带 --registry', hostSrc.includes('--registry='), true)

// ---------- Client：ModuleLoader id 必须是完整包名（dsh-phone 踩过的坑）
const registered = []
runInNewContext(clientSrc, { window: { __ModuleLoader__: { load: (definition) => registered.push(definition) } } })
eq('client 只注册一个模块', registered.length, 1)
eq('ModuleLoader id = package.name（带 scope）', registered.map((entry) => entry.id), [pkg.name])
ok('client 提供 factory', typeof (registered[0] && registered[0].factory) === 'function')
const ns = (/const NS = '([^']+)'/.exec(clientSrc) || [])[1]
eq('i18n NS = dsh-<slug>', ns, 'dsh-' + slug)

// ---------- slot 注册 id：不得带 scope（只允许短 slug / slug 前缀 / 通用字符串）
const slotIds = []
for (const match of clientSrc.matchAll(/ctx\.slots\.register\(\{\s*name: '([^']+)',\s*(?:key|id): '([^']+)'/g)) slotIds.push(match[2])
for (const match of clientSrc.matchAll(/registerWhen\('([^']+)',\s*\{\s*name: '([^']+)',\s*id: '([^']+)'/g)) slotIds.push(match[3])
const scopedSlotIds = slotIds.filter((id) => id.includes('@') || id.includes('/'))
eq('slot 注册 id 不带 scope/斜杠', scopedSlotIds, [])
// settings.section 的 id 必须是 slug（DSH 导航按 id 分组）
const settingsId = (/name: 'settings\.section',\s*\n?\s*id: '([^']+)'/.exec(clientSrc) || [])[1]
eq('settings.section id = slug', settingsId, slug)

if (failures > 0) {
  console.error('\nverify-plugin: ' + failures + ' 处不一致，修正后再发版/重启宿主')
  process.exit(1)
}
console.log('OK  verify-plugin: ' + pkg.name + ' · slug=' + slug + ' · 包名/patch/客户端的 id 一致')
