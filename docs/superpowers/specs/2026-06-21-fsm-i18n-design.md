# FSM Frontend Internationalization (i18n) Design Spec

**Date:** 2026-06-21
**Project:** factorio-server-manager-joey
**Branch:** feat/fsm-i18n
**Status:** Draft / Approved for Implementation

---

## 1. Overview and Goals

### 1.1 Problem

The Factorio Server Manager (FSM) frontend has zero internationalization support. All UI strings are hardcoded English embedded in JSX components. This blocks adoption by non-English-speaking server operators, particularly the Chinese community where Factorio has a large player base.

### 1.2 Goals

- Enable the UI to render in Simplified Chinese (zh-CN) as the first translated locale.
- Keep English as the authoritative fallback language (maintain existing strings as the source of truth).
- Introduce a translation architecture that makes adding future locales trivial (single new JSON folder).
- Minimize component refactoring: the `useTranslation()` Hook pattern mirrors existing React functional component style.
- Zero backend changes. Go error messages, log entries, and RCON output are not translated.
- Complete coverage of all ~200 UI strings across 9 view/page areas.

### 1.3 Non-Goals (see also Section 10)

- Translating Go backend strings, error messages, or Factorio server log output.
- Runtime locale switching without page reload (nice-to-have, not required for MVP).
- Right-to-left (RTL) language support.
- Pluralization rules or ICU MessageFormat.
- Integration with CI translation services (POEditor, Crowdin, etc.).

---

## 2. Architecture

### 2.1 Framework: react-i18next + i18next

Chosen over alternatives (react-intl, LinguiJS) because:

- `useTranslation()` Hook matches the existing functional component + Hooks pattern perfectly.
- No Redux or global state manager dependency (the app uses only `useState`).
- Backend-agnostic: translations are loaded as static JSON at build time, no XHR needed.
- `i18next-browser-languagedetector` provides zero-config language detection from `navigator.language`.

### 2.2 Installation

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

All three packages are runtime dependencies. No additional Webpack plugins or loaders are required (JSON imports are already supported by Webpack 5 with the default `json` module type; the existing config resolves `.json` extensions via `resolve.extensions`).

### 2.3 Initialization

A single initialization module is created at `ui/i18n.js`:

```js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enLayout from './locales/en/layout.json';
import enControls from './locales/en/controls.json';
import enMods from './locales/en/mods.json';
import enSaves from './locales/en/saves.json';
import enServerSettings from './locales/en/serverSettings.json';
import enLogs from './locales/en/logs.json';
import enConsole from './locales/en/console.json';
import enUserManagement from './locales/en/userManagement.json';

import zhCommon from './locales/zh-CN/common.json';
import zhLayout from './locales/zh-CN/layout.json';
import zhControls from './locales/zh-CN/controls.json';
import zhMods from './locales/zh-CN/mods.json';
import zhSaves from './locales/zh-CN/saves.json';
import zhServerSettings from './locales/zh-CN/serverSettings.json';
import zhLogs from './locales/zh-CN/logs.json';
import zhConsole from './locales/zh-CN/console.json';
import zhUserManagement from './locales/zh-CN/userManagement.json';

const resources = {
  en: {
    common: enCommon,
    layout: enLayout,
    controls: enControls,
    mods: enMods,
    saves: enSaves,
    serverSettings: enServerSettings,
    logs: enLogs,
    console: enConsole,
    userManagement: enUserManagement,
  },
  'zh-CN': {
    common: zhCommon,
    layout: zhLayout,
    controls: zhControls,
    mods: zhMods,
    saves: zhSaves,
    serverSettings: zhServerSettings,
    logs: zhLogs,
    console: zhConsole,
    userManagement: zhUserManagement,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [
      'common', 'layout', 'controls', 'mods', 'saves',
      'serverSettings', 'logs', 'console', 'userManagement',
    ],
    interpolation: {
      escapeValue: false, // React already escapes output
    },
    detection: {
      // Only check localStorage and navigator.language
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'fsm_lang',
    },
  });

export default i18n;
```

### 2.4 Provider Wrapping

In `ui/index.js`, import the i18n instance and wrap `<App>` with `<Suspense>`:

```jsx
import './i18n'; // initialize i18n before rendering
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App/App.jsx';

window.flash = (message, color = 'gray-light') =>
  Bus.emit('flash', ({ message, color }));

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(
  <Suspense fallback={<div>Loading...</div>}>
    <App />
  </Suspense>
);
```

`react-i18next` uses `Suspense` internally to delay rendering until translations are loaded. The `fallback` shows a brief loading indicator. For this app with static JSON imports, the Suspense resolves synchronously, so the fallback is a safety measure only.

### 2.5 Translation File Structure

```
ui/locales/
  en/
    common.json
    layout.json
    controls.json
    mods.json
    saves.json
    serverSettings.json
    logs.json
    console.json
    userManagement.json
  zh-CN/
    common.json
    layout.json
    controls.json
    mods.json
    saves.json
    serverSettings.json
    logs.json
    console.json
    userManagement.json
```

Every namespace folder mirrors `en/` exactly. Missing keys in `zh-CN/*.json` automatically fall back to `en/*.json` at runtime (no crash, no missing string).

---

## 3. Component-Level i18n Integration Pattern

### 3.1 Basic Pattern

**Before** (hardcoded English):

```jsx
import React from 'react';
import Button from '../components/Button';

const Controls = ({ serverStatus }) => {
  return (
    <Button type="success" className="w-full">
      Start Server
    </Button>
  );
};
```

**After** (translated):

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';

const Controls = ({ serverStatus }) => {
  const { t } = useTranslation('controls');

  return (
    <Button type="success" className="w-full">
      {t('startServer')}
    </Button>
  );
};
```

### 3.2 Component with Multiple Namespaces

When a view imports strings from `common` and its own namespace:

```jsx
const { t } = useTranslation(['mods', 'common']);
// Usage:
t('installMod')      // looks in 'mods' first
t('save')             // looks in 'common' (fallback namespace)
t('common:save')      // explicit namespace prefix
```

Explicit prefix (`'common:save'`) is preferred for clarity when mixing namespaces, except in trivial cases.

### 3.3 Interpolation (Dynamic Values)

For strings that embed variables (save names, usernames, version numbers):

**Translation JSON** (`en/common.json`):
```json
{
  "saveLastModified": "Last Modified: {{date}}",
  "deleteConfirm": "Are you sure you want to delete \"{{name}}\"?",
  "versionInfo": "Version {{version}}"
}
```

**Component usage:**
```jsx
{t('saveLastModified', { date: save.last_mod })}
{t('deleteConfirm', { name: save.name })}
{t('versionInfo', { version: factorioVersion })}
```

### 3.4 No Changes to Pure Presentational Components

Components like `Button`, `Panel`, `Input`, `Label`, `Modal` do NOT import `useTranslation`. They accept `children` or `text` props. The translation call happens at the call site.

**Exception:** `ConfirmDialog` receives translated `title`, `content` props from its parent. Its own button labels ("Cancel", "Confirm") are translated inside the component via `useTranslation('common')`.

### 3.5 Changes Outside JSX

For the `window.flash()` calls in JavaScript logic (e.g., error toasts):

```jsx
import { useTranslation } from 'react-i18next';
const { t } = useTranslation('common');

// Before:
window.flash("Login failed. Username or Password wrong.", "red");

// After:
window.flash(t('loginFailed'), "red");
```

For non-component files (api resources, utility modules) that display user-facing messages, they must either accept a `t` function as a parameter or the calling component must wrap the message.

---

## 4. Translation Key Naming Convention

### 4.1 Rules

- **Flat camelCase.** No dots, no nesting. Each JSON file is a single-level object.
- **VerbPrefix for actions.** `startServer`, `stopServer`, `deleteSave`, `uploadMod`.
- **NounOnly for labels.** `serverStatus`, `factorioVersion`, `lastModified`, `actions`.
- **Status constants in SCREAMING_SNAKE.** `RUNNING`, `STOPPED`, `UNKNOWN`.
- **Error messages:** `errorRequired`, `errorInvalidPort`, `loginFailed`.
- **Confirm dialogs:** `confirmDeleteMod`, `confirmStopServer`.
- **Placeholder text:** `placeholderUsername`, `placeholderPassword`.

### 4.2 Examples per Category

```
# Controls
"startServer"         "Start Server"
"saveStopServer"      "Save & Stop Server"
"killServer"          "Kill Server"
"serverStatus"        "Server Status"
"status"              "Status"
"ip"                  "IP"
"port"                "Port"
"factorioVersion"     "Factorio Version"
"save"                "Save"
"RUNNING"             "Running"
"STOPPED"             "Stopped"
"UNKNOWN"             "Unknown"

# Common
"save"                "Save"
"cancel"              "Cancel"
"confirm"             "Confirm"
"delete"              "Delete"
"loading"             "Loading..."
"errorOccurred"       "An error occurred"
"loginFailed"         "Login failed. Username or Password wrong."
"name"                "Name"
"actions"             "Actions"
```

### 4.3 What NOT to Do

```
# BAD - deep nesting
"server.controls.start"   "Start Server"

# BAD - inconsistent casing
"start_server"            "Start Server"
"stopServer"              "Stop Server"

# BAD - HTML in values
"welcomeMessage"          "Welcome to <b>FSM</b>"
```

Values are plain strings. No HTML markup inside JSON values. Components use React elements if formatting is needed.

---

## 5. Language Detection and Switching UX

### 5.1 Auto-Detection

On first visit, `i18next-browser-languagedetector` checks `navigator.language`:

| Browser Language | Selected Locale |
|---|---|
| `zh-CN`, `zh-TW`, `zh-HK`, `zh` | `zh-CN` |
| Any other value | `en` |

The check uses simple prefix matching: if `navigator.language` starts with `zh`, load `zh-CN`. Otherwise, load `en`.

### 5.2 Persistence

The selected language is stored in `localStorage` key `fsm_lang`. On subsequent visits, the stored preference takes priority over `navigator.language`.

Clearing `localStorage` or using a private/incognito window triggers auto-detection again.

### 5.3 Language Switcher UI

A language toggle is added to the Layout sidebar, inside the "FSM Administration" section, below the Help link:

```jsx
// In Layout.jsx, after the Help link:
<Link to="/user-management">Users</Link>
<Link to="/help">Help</Link>
{/* new */}
<div className="mt-4 mx-4">
  <select
    className="w-full bg-gray-dark text-white border border-gray-light rounded px-2 py-1 text-sm"
    value={i18n.language}
    onChange={(e) => {
      i18n.changeLanguage(e.target.value);
    }}
  >
    <option value="en">English</option>
    <option value="zh-CN">简体中文</option>
  </select>
</div>
```

The `<select>` uses `i18n.changeLanguage()` which triggers a re-render of all `useTranslation()` hooks. The language switcher does NOT reload the page.

**Implementation note:** `i18n` instance must be imported in Layout.jsx:

```jsx
import i18n from '../../i18n';
```

### 5.4 Future Locales

Adding a new locale (e.g., `ja`):

1. Copy `ui/locales/en/` to `ui/locales/ja/`.
2. Translate all JSON values (not keys).
3. Add the import block and `ja` entry in `ui/i18n.js`.
4. Add the `<option>` to the language switcher.

No other code changes needed.

---

## 6. Namespace Scope and Examples

### 6.1 `common` (Universal)

**Scope:** Buttons, labels, messages, and statuses used across multiple views. Actions in `ConfirmDialog`, `Flash`, table headers.

| Key | EN Value | Usage |
|---|---|---|
| `save` | Save | Button text |
| `cancel` | Cancel | Button text (ConfirmDialog) |
| `confirm` | Confirm | Button text (ConfirmDialog) |
| `delete` | Delete | Button text, icon tooltip |
| `loading` | Loading... | Fallback, async states |
| `errorOccurred` | An error occurred | Generic error fallback |
| `loginFailed` | Login failed. Username or Password wrong. | Login error flash |
| `name` | Name | Table header column |
| `actions` | Actions | Table header column |
| `username` | Username | Login form label |
| `password` | Password | Login form label, field label |
| `email` | Email | User management header |
| `role` | Role | User management header |
| `required` | This field is required | Validation error message |
| `signIn` | Sign In | Login button |
| `logout` | Logout | Layout sidebar button |
| `saveLastModified` | Last Modified | Saves table header |
| `size` | Size | Saves table header |
| `lastModifiedAt` | Last Modified At | Saves table header |

### 6.2 `layout` (Navigation and Sidebar)

**Scope:** Sidebar section headers, navigation links, page title areas.

| Key | EN Value | Usage |
|---|---|---|
| `appTitle` | Factorio Server Manager | Sidebar header |
| `serverStatus` | Server Status | Sidebar section heading |
| `serverManagement` | Server Management | Sidebar section heading |
| `fsmAdministration` | FSM Administration | Sidebar section heading |
| `linkControls` | Controls | Nav link |
| `linkSaves` | Saves | Nav link |
| `linkMods` | Mods | Nav link |
| `linkServerSettings` | Server Settings | Nav link |
| `linkGameSettings` | Game Settings | Nav link |
| `linkConsole` | Console | Nav link |
| `linkLogs` | Logs | Nav link |
| `linkUsers` | Users | Nav link |
| `linkHelp` | Help | Nav link |

### 6.3 `controls` (Server Control Panel)

**Scope:** The main dashboard where operators start/stop/kill the Factorio server and see current status.

| Key | EN Value | Usage |
|---|---|---|
| `serverStatus` | Server Status | Panel title |
| `startServer` | Start Server | Button text (server stopped) |
| `saveStopServer` | Save & Stop Server | Button text (server running) |
| `killServer` | Kill Server | Button text (danger) |
| `status` | Status | Field label |
| `ip` | IP | Field label |
| `port` | Port | Field label |
| `factorioVersion` | Factorio Version | Field label |
| `save` | Save | Field label |
| `ipRequired` | IP is required and must be valid. | Validation error |
| `portRequired` | Port is required within range 1-65535 | Validation error |
| `saveRequired` | Save is required and must be valid. | Validation error |

### 6.4 `mods` (Mod Management)

**Scope:** Tab navigation for install/upload/load-from-save, mod list table, mod packs.

| Key | EN Value | Usage |
|---|---|---|
| `mods` | Mods | Panel title |
| `modPacks` | Mod packs | Panel title |
| `installMod` | Install Mod | Tab title |
| `uploadMod` | Upload Mod | Tab title |
| `loadModsFromSave` | Load Mods from Save | Tab title |
| `changingModsDisabled` | Changing mods is disabled while the server is running! | Warning banner |
| `deleteAllMods` | Delete all Mods | Button text |
| `updateAllMods` | Update all Mods | Button text |
| `downloadAllMods` | Download all Mods | Link text |
| `confirmDeleteMod` | Are you sure you want to delete this mod? | Confirm dialog |
| `noModsInstalled` | No mods installed | Empty state |
| `searchMods` | Search mods... | Search placeholder |

### 6.5 `saves` (Save Game Management)

**Scope:** Create/upload/delete save files, save listing table.

| Key | EN Value | Usage |
|---|---|---|
| `createSave` | Create Save | Panel title |
| `uploadSave` | Upload Save | Panel title |
| `saves` | Saves | Panel title |
| `createSaveDisabled` | Create a new Save is only possible if the Factorio server is not running. | Disabled state message |
| `confirmDeleteSave` | Are you sure you want to delete this save? | Confirm dialog |
| `downloadSave` | Download | Download link |
| `noSavesFound` | No saves found | Empty state |

### 6.6 `serverSettings` (Server Configuration)

**Scope:** The server settings form (all dynamic fields generated from API).

| Key | EN Value | Usage |
|---|---|---|
| `serverSettings` | Server Settings | Panel title |
| `saveSettings` | Save | Submit button text |
| `settingsSaved` | Settings saved. | Flash success message |
| `visibility` | Visibility | Visibility field label |

The server settings form is largely data-driven: field labels and comments come from the API response. These are NOT translated. Only static UI chrome (panel title, submit button, flash messages) is in the translation file.

### 6.7 `logs` (Log Viewer)

**Scope:** The log tail viewer page.

| Key | EN Value | Usage |
|---|---|---|
| `logs` | Logs | Panel title |
| `noLogsAvailable` | No logs available | Empty state |

### 6.8 `console` (RCON Console)

**Scope:** The RCON command console.

| Key | EN Value | Usage |
|---|---|---|
| `console` | Console | Panel title |
| `consoleNotAvailable` | The console is not available, because Factorio is not running. | Disabled state message |
| `inputPlaceholder` | Type a command... | Input placeholder |

### 6.9 `userManagement` (User Administration)

**Scope:** User list, create user, change password.

| Key | EN Value | Usage |
|---|---|---|
| `listOfUsers` | List of Users | Panel title |
| `changePassword` | Change Password | Panel title |
| `createUser` | Create User | Panel title |
| `confirmDeleteUser` | Are you sure you want to delete this user? | Confirm dialog |
| `noUsersFound` | No users found | Empty state |

---

## 7. Build Considerations

### 7.1 Webpack JSON Support

Webpack 5 natively supports JSON imports as part of its default module types. The existing webpack config already includes `.json` in `resolve.extensions`:

```js
resolve: {
  extensions: ['.js', '.json', '.jsx']
}
```

No additional loaders or plugins are needed for the translation JSON files. Translations are bundled directly into the JS output. This is intentional for a single-page app served as Go embedded assets -- no async network requests for locale files.

### 7.2 Bundle Size Impact

Each namespace JSON file for English is roughly 0.5-1.5 KB (minified). The total for 9 English + 9 Chinese files is approximately 15-25 KB uncompressed, ~5-8 KB gzipped. This is negligible against the existing bundle.

### 7.3 No Code Splitting by Locale

For MVP, all locales are bundled into a single JS chunk. Future optimization (dynamic import per locale) can be added if the number of locales exceeds 5 or the translation data exceeds 100 KB.

### 7.4 Build Verification

After adding `ui/i18n.js` and all locale JSON files, run:

```bash
npm run build
```

The build must complete with zero errors. After build, verify that `app/bundle.js` contains translated strings (check by looking for a known zh-CN string in the minified output, or run a grep for `startServer` in the built bundle).

---

## 8. Rollout Strategy

### 8.1 Implementation Order

The work is divided into phases to reduce risk and enable incremental validation:

| Phase | Scope | Files | Approx. Strings |
|---|---|---|---|
| **P1: Core infrastructure** | `ui/i18n.js`, `ui/index.js` change, `ui/locales/en/*` (complete), `ui/locales/zh-CN/*` (complete), `App.jsx` changes | 20 files | 200+ key definitions |
| **P2: Layout + Controls** | Layout sidebar, server status panel, start/stop/kill buttons | `Layout.jsx`, `Controls.jsx` | ~30 |
| **P3: Mods** | Mod management tabs, mod list, mod packs | `Mods.jsx`, child components | ~30 |
| **P4: Saves** | Save listing, create/upload forms, delete confirm | `Saves.jsx`, child components | ~20 |
| **P5: Settings + Console + Logs** | Server settings form chrome, game settings, console, log viewer | `ServerSettings.jsx`, `GameSettings.jsx`, `Console.jsx`, `Logs.jsx` | ~15 |
| **P6: User Management + Login + Help** | User CRUD, login form, help page | `UserManagement.jsx`, `Login.jsx`, `Help.jsx` | ~25 |
| **P7: Shared components** | `ConfirmDialog`, `Flash`, form validation errors | `ConfirmDialog.jsx`, shared form error strings | ~10 |

### 8.2 Fallback Behavior

During rollout (partial implementation), untranslated components continue to show hardcoded English strings. The i18n infrastructure is live from P1, but components are migrated one at a time.

**After full rollout**, if a zh-CN user encounters a missing key (e.g., a newly added string that only exists in `en/`), i18next automatically falls back to the English value. No crash, no empty string, no flicker.

### 8.3 Rollback

Reverting is straightforward:

1. In `ui/index.js`, remove the `import './i18n'` line and remove the `<Suspense>` wrapper.
2. Delete `ui/i18n.js` and `ui/locales/`.
3. Revert `t()` calls back to hardcoded strings across all components.

---

## 9. Testing and Verification Criteria

### 9.1 Manual Verification

After implementation on the `feat/fsm-i18n` branch:

| Test | Steps | Expected Result |
|---|---|---|
| English default | Clear localStorage, load app with `navigator.language = 'en-US'` | All UI in English |
| Chinese auto-detect | Clear localStorage, load app with `navigator.language = 'zh-CN'` | All UI in Simplified Chinese |
| Language switch | Use the dropdown to switch between English and Chinese | UI language changes immediately, no page reload |
| Persistence | Switch to Chinese, reload the page | UI loads in Chinese |
| Partial key fallback | Temporarily remove a key from `zh-CN/controls.json`, load with Chinese | The removed key shows its English value |
| All pages render | Navigate to every route (Controls, Saves, Mods, etc.) in both languages | Each page renders without errors, all strings localized |

### 9.2 Build Verification

```bash
npm run build
# Must exit 0 with no warnings related to i18n
```

### 9.3 Unit Testing (if applicable)

No unit tests currently exist for this project (`"test": "echo no test specified"`). Creating tests for the i18n system is out of scope for this effort. Verification is manual.

### 9.4 Edge Cases

- **Browser with `navigator.language = 'zh-TW'`**: correctly maps to `zh-CN` (no separate Traditional Chinese locale for MVP).
- **Browser with no `localStorage` (private mode)**: falls back to `navigator.language` on every page load.
- **Language code with region subtag mismatch** (e.g., `zh-Hans-CN`): the language detector strips to `zh`, which matches the `zh-CN` resource bundle prefix.

---

## 10. Out of Scope

The following are explicitly excluded from this specification and should not be implemented during the i18n effort:

- **Backend translation.** Go server responses, error structs, and log output remain in English.
- **Game content translation.** Factorio mod names, in-game item names, or save file metadata.
- **Traditional Chinese (zh-TW).** Only Simplified Chinese is targeted. zh-TW can be added as a future locale.
- **RTL languages.** Arabic, Hebrew, Persian, etc. No layout mirroring consideration.
- **Pluralization.** `i18next` supports plural forms, but this app has no strings requiring `count`-based variants.
- **CI integration.** No POEditor, Crowdin, Lokalise, or Weblate configuration.
- **Translation memory / workflow.** No tooling for managing translation change diffs between releases.
- **Dynamic locale loading.** All locales are bundled into the Webpack output, not fetched at runtime.
- **Accessibility attributes.** `aria-label` translations are not covered; the existing app has minimal aria usage.
- **Unit tests for i18n.** The project currently has no test framework; adding one is a separate effort.

---

## Appendix A: Full `en/common.json` Reference (Template)

```json
{
  "save": "Save",
  "cancel": "Cancel",
  "confirm": "Confirm",
  "delete": "Delete",
  "loading": "Loading...",
  "errorOccurred": "An error occurred.",
  "loginFailed": "Login failed. Username or Password wrong.",
  "name": "Name",
  "actions": "Actions",
  "username": "Username",
  "password": "Password",
  "email": "Email",
  "role": "Role",
  "required": "This field is required",
  "signIn": "Sign In",
  "logout": "Logout",
  "saveSettings": "Settings saved.",
  "saveLastModified": "Last Modified",
  "size": "Size",
  "lastModifiedAt": "Last Modified At"
}
```

## Appendix B: Complete File Change Inventory

| File | Change |
|---|---|
| `ui/i18n.js` | **NEW** - i18next initialization, all locale imports |
| `ui/index.js` | Import `./i18n`, wrap `<App>` with `<Suspense>` |
| `ui/locales/en/common.json` | **NEW** - English common strings |
| `ui/locales/en/layout.json` | **NEW** - English layout strings |
| `ui/locales/en/controls.json` | **NEW** - English controls strings |
| `ui/locales/en/mods.json` | **NEW** - English mods strings |
| `ui/locales/en/saves.json` | **NEW** - English saves strings |
| `ui/locales/en/serverSettings.json` | **NEW** - English server settings strings |
| `ui/locales/en/logs.json` | **NEW** - English logs strings |
| `ui/locales/en/console.json` | **NEW** - English console strings |
| `ui/locales/en/userManagement.json` | **NEW** - English user management strings |
| `ui/locales/zh-CN/common.json` | **NEW** - Chinese common strings |
| `ui/locales/zh-CN/layout.json` | **NEW** - Chinese layout strings |
| `ui/locales/zh-CN/controls.json` | **NEW** - Chinese controls strings |
| `ui/locales/zh-CN/mods.json` | **NEW** - Chinese mods strings |
| `ui/locales/zh-CN/saves.json` | **NEW** - Chinese saves strings |
| `ui/locales/zh-CN/serverSettings.json` | **NEW** - Chinese server settings strings |
| `ui/locales/zh-CN/logs.json` | **NEW** - Chinese logs strings |
| `ui/locales/zh-CN/console.json` | **NEW** - Chinese console strings |
| `ui/locales/zh-CN/userManagement.json` | **NEW** - Chinese user management strings |
| `ui/App/App.jsx` | (No change needed if i18n init is in `index.js`) |
| `ui/App/components/Layout.jsx` | Add language switcher dropdown, translate sidebar strings |
| `ui/App/views/Controls.jsx` | Wrap all hardcoded strings with `t()` |
| `ui/App/views/Mods/Mods.jsx` | Wrap all hardcoded strings with `t()` |
| `ui/App/views/Saves/Saves.jsx` | Wrap all hardcoded strings with `t()` |
| `ui/App/views/ServerSettings.jsx` | Translate panel title, button, flash message |
| `ui/App/views/GameSettings.jsx` | Translate panel title |
| `ui/App/views/Console.jsx` | Translate panel title, disabled message, placeholder |
| `ui/App/views/Logs.jsx` | Translate panel title |
| `ui/App/views/UserManagement/UserManagment.jsx` | Translate panel titles, table headers |
| `ui/App/views/Login.jsx` | Translate form labels, placeholders, button, flash |
| `ui/App/views/Help.jsx` | Translate panel title, section headings |
| `ui/App/components/ConfirmDialog.jsx` | Translate Cancel/Confirm buttons |
| `ui/App/components/Flash.jsx` | (May need adjustment if flash messages carry translated strings) |

---

*End of spec.*
