# 添加新语言指南

FSM 前端基于 `react-i18next`，添加新语言只需创建翻译文件并注册即可。

## 快速上手（以日语 ja 为例）

### 第 1 步：创建翻译文件

```bash
mkdir -p ui/locales/ja
```

复制英文文件作为模板：

```bash
cp ui/locales/en/*.json ui/locales/ja/
```

### 第 2 步：翻译

逐个编辑 `ui/locales/ja/` 下的 9 个 JSON 文件，**只改 value，不改 key**。

| 文件 | 示例 key | 英文 | 日文翻译 |
|---|---|---|---|
| `common.json` | `save` | Save | 保存 |
| `common.json` | `cancel` | Cancel | キャンセル |
| `common.json` | `confirm` | Confirm | 確認 |
| `controls.json` | `startServer` | Start Server | サーバー起動 |
| `controls.json` | `RUNNING` | Running | 実行中 |
| `layout.json` | `appTitle` | Factorio Server Manager | Factorio サーバーマネージャー |

### 第 3 步：注册语言

编辑 `ui/i18n.js`，在两个地方添加 ja：

**位置 1 — import 翻译文件：**

```js
// 在 zh-CN imports 后面添加
import jaCommon from './locales/ja/common.json';
import jaLayout from './locales/ja/layout.json';
import jaControls from './locales/ja/controls.json';
import jaMods from './locales/ja/mods.json';
import jaSaves from './locales/ja/saves.json';
import jaServerSettings from './locales/ja/serverSettings.json';
import jaLogs from './locales/ja/logs.json';
import jaConsole from './locales/ja/console.json';
import jaUserManagement from './locales/ja/userManagement.json';
```

**位置 2 — 添加到 resources 对象：**

```js
const resources = {
  en: { /* 已有 */ },
  'zh-CN': { /* 已有 */ },
  ja: {
    common: jaCommon,
    layout: jaLayout,
    controls: jaControls,
    mods: jaMods,
    saves: jaSaves,
    serverSettings: jaServerSettings,
    logs: jaLogs,
    console: jaConsole,
    userManagement: jaUserManagement,
  },
};
```

### 第 4 步：添加到语言切换器

编辑 `ui/App/components/Layout.jsx`，在 `<select>` 中添加：

```jsx
<option value="ja">日本語</option>
```

### 第 5 步：验证

```bash
npm run build
```

构建通过即完成。浏览器语言设为日语时自动显示日文，也可通过侧边栏切换器手动选择。

---

## 翻译文件结构

```
ui/locales/
├── en/               ← 英文（fallback，必须保持完整）
│   ├── common.json   ← 通用词汇（保存/取消/确认/删除...）
│   ├── layout.json   ← 导航栏/侧边栏/页面标题
│   ├── controls.json ← 服务器启停控制面板
│   ├── mods.json     ← Mod 管理全部子页面
│   ├── saves.json    ← 存档管理全部子页面
│   ├── serverSettings.json ← 服务器+游戏设置
│   ├── logs.json     ← 日志页面
│   ├── console.json  ← RCON 控制台
│   └── userManagement.json ← 用户管理/登录
├── zh-CN/            ← 简体中文（已完成）
└── ja/               ← 日语（按本指南添加）
```

## 翻译规则

1. **只改 value，不改 key。** key 是代码引用的标识，改了会导致显示空白。
2. **保持扁平结构。** 所有 key 在 JSON 顶层，不要嵌套。
3. **不要修改 HTML。** 翻译值里不要放 `<div>`、`<span>` 等标签。
4. **大写 key 是状态值**（如 `RUNNING`、`STOPPED`、`UNKNOWN`），翻译时用对应的状态词。
5. **en/ 是权威源。** 如果某个 key 在目标语言中缺失，i18next 会自动回退到英文，不会报错。

## 自动语言检测

`i18next-browser-languagedetector` 按以下优先级检测：

1. `localStorage` 中 `fsm_lang` 的值（用户手动切换后记住）
2. 浏览器 `navigator.language`

例如浏览器语言是 `ja` → 自动加载日语；无匹配 → 回退英文。

## 常见 BCP 47 语言标签

| 语言 | 标签 | 写入 `i18n.js` |
|---|---|---|
| 日语 | `ja` | `ja` |
| 韩语 | `ko` | `ko` |
| 繁体中文 | `zh-TW` | `zh-TW` |
| 德语 | `de` | `de` |
| 法语 | `fr` | `fr` |
| 俄语 | `ru` | `ru` |
| 西班牙语 | `es` | `es` |
| 葡萄牙语 | `pt` | `pt` |
| 波兰语 | `pl` | `pl` |

## 注意事项

- **不要删除或修改 `en/` 下的文件。** 英文是 fallback 语言，必须保持完整。
- **新语言的 JSON 文件名必须与 `en/` 完全一致。**
- 如果不想翻译所有 key，可以先复制英文再逐条翻译，未翻译的 key 会自动回退英文。
- Factorio 社区有大量活跃的非英语玩家，欢迎贡献翻译 PR。
