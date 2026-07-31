# Implementation Plan: FSM Frontend i18n with zh-CN Support

**Date:** 2026-06-21
**Spec:** `docs/superpowers/specs/2026-06-21-fsm-i18n-design.md`
**Branch:** `feat/fsm-i18n`
**Stack:** React 18, webpack 5, ~95 unique UI strings across 22 component/view files

---

## Task Dependency Graph

| Task | Depends On | Reason |
|------|------------|--------|
| T1: Core infrastructure | None | i18n init must exist before any component uses `t()` |
| T2: Install npm deps | T1 | deps needed before i18n.js can import |
| T3: Create locale JSON (en) | None | can parallel with T1, T2 |
| T4: Create locale JSON (zh-CN) | T3 | zh-CN mirrors en structure exactly |
| T5: ConfirmDialog i18n | T1 | shared component used by Mods; must be ready before P3 |
| T6: Layout sidebar i18n | T1 | includes language switcher + sidebar strings |
| T7: Controls page i18n | T1 | standalone view |
| T8: Mods page i18n | T1, T5 | uses ConfirmDialog; has 7 sub-components |
| T9: Saves page i18n | T1, T5 | uses ConfirmDialog; has 2 sub-components |
| T10: Settings + Console + Logs i18n | T1 | 4 simple view files + Flash |
| T11: User Mgmt + Login + Help i18n | T1, T6 | Login uses Flash |
| T12: Build verification | All | final integration test |
| T13: Commit | T12 | atomic commit of all changes |

---

## Parallel Execution Waves

**Wave 1** (Start immediately):
- [ ] T1: Core infrastructure (i18n.js + index.js wrapping)
- [ ] T3: Create en/ locale JSON files (9 files)

**Wave 2** (After T1 + T3):
- [ ] T2: Install npm deps
- [ ] T4: Create zh-CN/ locale JSON files (9 files, mirroring en/)
- [ ] T5: ConfirmDialog i18n
- [ ] T6: Layout sidebar i18n + language switcher

**Wave 3** (After T5):
- [ ] T7: Controls page i18n
- [ ] T8: Mods page i18n (7 sub-components)
- [ ] T9: Saves page i18n (2 sub-components)
- [ ] T10: Settings + Console + Logs i18n (4 files)

**Wave 4** (After T6):
- [ ] T11: User Management + Login + Help i18n (5 files)

**Wave 5** (After all tasks):
- [ ] T12: Build verification (`npm run build`)
- [ ] T13: Commit

**Critical Path:** T1 → T5 → T8 → T12 → T13

---

## Tasks

### T1: Core Infrastructure — `ui/i18n.js` + `ui/index.js` wrapping

**Status:** pending

**Files to create/modify:**
- `ui/i18n.js` — **NEW** — i18next initialization with all 9 namespaces, language detector, localStorage cache
- `ui/index.js` — **MODIFY** — add `import './i18n'` + wrap `<App>` with `<Suspense>`

**Verification:**
- i18n.js exports configured i18n instance
- All 9 namespaces registered for both `en` and `zh-CN`
- index.js renders with Suspense wrapper
- `npm run build` succeeds

---

### T2: Install npm Dependencies

**Status:** pending

**Command:**
```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

**Verification:**
- Three packages appear in `package.json` `dependencies`
- `npm run build` succeeds after install
- No webpack config changes needed

---

### T3: Create English Locale JSON Files (9 files)

**Status:** pending

**Directory:** `ui/locales/en/` (NEW)

**Files:**

1. `common.json` — save, cancel, confirm, delete, loading, errorOccurred, loginFailed, name, actions, username, password, email, role, required, signIn, logout, saveSettings, saveLastModified, size, lastModifiedAt, settingsSaved
2. `layout.json` — appTitle, serverStatus, serverManagement, fsmAdministration, linkControls, linkSaves, linkMods, linkServerSettings, linkGameSettings, linkConsole, linkLogs, linkUsers, linkHelp
3. `controls.json` — serverStatus, startServer, saveStopServer, killServer, status, ip, port, factorioVersion, save, ipRequired, portRequired, saveRequired, RUNNING, STOPPED, UNKNOWN
4. `mods.json` — mods, modPacks, installMod, uploadMod, loadModsFromSave, changingModsDisabled, deleteAllMods, updateAllMods, downloadAllMods, confirmDeleteMod, noModsInstalled, searchMods, install, modPortal, loadingModList
5. `saves.json` — createSave, uploadSave, saves, createSaveDisabled, confirmDeleteSave, downloadSave, noSavesFound, name, lastModifiedAt, size, actions
6. `serverSettings.json` — serverSettings, gameSettings, saveSettings, settingsSaved, visibility
7. `logs.json` — logs, noLogsAvailable
8. `console.json` — console, consoleNotAvailable, inputPlaceholder, commandSent
9. `userManagement.json` — listOfUsers, changePassword, createUser, confirmDeleteUser, noUsersFound, name, role, email, actions

**Verification:**
- All 9 files parse as valid JSON
- Flat structure with camelCase keys
- `npm run build` succeeds

---

### T4: Create zh-CN Locale JSON Files (9 files)

**Status:** pending

**Directory:** `ui/locales/zh-CN/` (NEW)

All 9 files mirror `en/` exactly with Chinese translations. Key examples:
- `common.json`: `"save": "保存"`, `"cancel": "取消"`, `"confirm": "确认"`, `"delete": "删除"`
- `controls.json`: `"startServer": "启动服务器"`, `"saveStopServer": "保存并停止服务器"`, `"killServer": "强制停止服务器"`
- `layout.json`: `"appTitle": "Factorio 服务器管理器"`, `"linkControls": "控制面板"`

**Verification:**
- Every key from en/ exists in zh-CN/
- Values are plain strings, no HTML markup
- `npm run build` succeeds

---

### T5: ConfirmDialog Component i18n

**Status:** pending

**File:** `ui/App/components/ConfirmDialog.jsx` (MODIFY)

**Changes:**
- Add `useTranslation('common')` hook
- Replace `<Button>Cancel</Button>` → `<Button>{t('cancel')}</Button>`
- Replace `<Button>Confirm</Button>` → `<Button>{t('confirm')}</Button>`

**Verification:**
- Buttons show translated text
- Existing functionality preserved (isLoading, onSuccess, close)
- `npm run build` succeeds

---

### T6: Layout Sidebar i18n + Language Switcher

**Status:** pending

**File:** `ui/App/components/Layout.jsx` (MODIFY)

**Changes:**
- Add `useTranslation(['layout', 'common', 'controls'])` hook
- Replace all sidebar link texts with `t()` calls
- Replace status indicator values (Running/Stopped/Unknown) with `t()` calls
- Add language switcher `<select>` in FSM Administration section:
  ```jsx
  <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
    <option value="en">English</option>
    <option value="zh-CN">简体中文</option>
  </select>
  ```

**Verification:**
- All sidebar strings render correctly
- Language switcher toggles between en/zh-CN immediately
- Language preference persists in localStorage
- `npm run build` succeeds

---

### T7: Controls Page i18n

**Status:** pending

**File:** `ui/App/views/Controls.jsx` (MODIFY)

**Changes:**
- Add `useTranslation('controls')` hook
- Replace panel title, field labels, button texts, error messages with `t()` calls
- Keep dynamic values (bindip, port, savefile) unchanged

**Verification:**
- All hardcoded English strings replaced
- Dynamic values preserved
- `npm run build` succeeds

---

### T8: Mods Page i18n (7 files)

**Status:** pending

**Files (all MODIFY):**
1. `ui/App/views/Mods/Mods.jsx` — panel titles, buttons, warning banner
2. `ui/App/views/Mods/components/UploadMod.jsx` — form labels, buttons
3. `ui/App/views/Mods/components/LoadMods.jsx` — form elements, ConfirmDialog, flash
4. `ui/App/views/Mods/components/ModPack.jsx` — ConfirmDialog usage
5. `ui/App/views/Mods/components/CreateModPack.jsx` — button, Modal title, form labels
6. `ui/App/views/Mods/components/AddMod/components/AddModForm.jsx` — form labels, buttons
7. `ui/App/views/Mods/components/AddMod/components/FactorioLogin.jsx` — form labels, button, flash
8. `ui/App/views/Mods/components/AddMod/components/SelectVersionForm.jsx` — Modal title, table headers

**Verification:**
- All mods pages render with translated strings
- Tab navigation works
- ConfirmDialog shows translated buttons
- `npm run build` succeeds

---

### T9: Saves Page i18n (3 files)

**Status:** pending

**Files (all MODIFY):**
1. `ui/App/views/Saves/Saves.jsx` — panel titles, table headers, disabled state
2. `ui/App/views/Saves/components/CreateSaveForm.jsx` — form labels, button, error
3. `ui/App/views/Saves/components/UploadSaveForm.jsx` — form label, placeholder, error, button

**Verification:**
- All save pages render with translated strings
- Delete confirmation shows proper strings
- `npm run build` succeeds

---

### T10: Settings + Console + Logs i18n (4 files)

**Status:** pending

**Files (all MODIFY):**
1. `ui/App/views/ServerSettings.jsx` — panel title, save button, flash message
2. `ui/App/views/GameSettings.jsx` — panel title
3. `ui/App/views/Console.jsx` — panel title, disabled message, input placeholder
4. `ui/App/views/Logs.jsx` — panel title

**Verification:**
- All 4 pages render with translated strings
- Flash message uses translated string
- `npm run build` succeeds

---

### T11: User Management + Login + Help i18n (5 files)

**Status:** pending

**Files (all MODIFY):**
1. `ui/App/views/UserManagement/UserManagment.jsx` — panel titles, table headers
2. `ui/App/views/UserManagement/components/CreateUserForm.jsx` — labels, placeholders, errors, buttons
3. `ui/App/views/UserManagement/components/ChangePasswordForm.jsx` — labels, placeholders, errors, buttons, flash
4. `ui/App/views/Login.jsx` — panel title, form labels, placeholders, errors, buttons, flash
5. `ui/App/views/Help.jsx` — panel title, section headings, body text

**Verification:**
- All pages render with translated strings
- Flash messages use translated text
- Form validation errors show translated text
- `npm run build` succeeds

---

### T12: Build Verification

**Status:** pending

**Command:**
```bash
npm run build
```

**Checks:**
- Build exits with code 0
- No i18n-related warnings
- Output files exist in `app/` directory

---

### T13: Atomic Commit

**Status:** pending

**Commit message:** `功能: 添加 FSM 前端国际化支持(zh-CN)`

**Files staged:** ~30 files (new i18n config + 18 JSON locale files + ~12 modified components + package.json + package-lock.json)

---

## Success Criteria

1. `npm run build` exits 0 with no i18n-related warnings
2. All files modified/created as specified
3. English locale loads by default
4. Chinese locale auto-detects when `navigator.language = 'zh-CN'`
5. Language switcher toggles between en/zh-CN immediately
6. Language preference persists across page reload
7. Missing zh-CN keys fall back to English gracefully
8. All pages render without console errors in both languages
