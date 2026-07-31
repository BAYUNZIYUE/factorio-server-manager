import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// English locale files (fallback language)
import enCommon from './locales/en/common.json';
import enLayout from './locales/en/layout.json';
import enControls from './locales/en/controls.json';
import enMods from './locales/en/mods.json';
import enSaves from './locales/en/saves.json';
import enServerSettings from './locales/en/serverSettings.json';
import enLogs from './locales/en/logs.json';
import enConsole from './locales/en/console.json';
import enUserManagement from './locales/en/userManagement.json';
import enServerVersion from './locales/en/serverVersion.json';
import enInstance from './locales/en/instance.json';

// Chinese locale files
import zhCommon from './locales/zh-CN/common.json';
import zhLayout from './locales/zh-CN/layout.json';
import zhControls from './locales/zh-CN/controls.json';
import zhMods from './locales/zh-CN/mods.json';
import zhSaves from './locales/zh-CN/saves.json';
import zhServerSettings from './locales/zh-CN/serverSettings.json';
import zhLogs from './locales/zh-CN/logs.json';
import zhConsole from './locales/zh-CN/console.json';
import zhUserManagement from './locales/zh-CN/userManagement.json';
import zhServerVersion from './locales/zh-CN/serverVersion.json';
import zhInstance from './locales/zh-CN/instance.json';

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
    serverVersion: enServerVersion,
    instance: enInstance,
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
    serverVersion: zhServerVersion,
    instance: zhInstance,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'fsm_lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
