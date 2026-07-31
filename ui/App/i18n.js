import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from 'i18next-http-backend'
import LanguageDetector from "i18next-browser-languagedetector";
import enTranslations from "./locales/en.json";
import enCommonTranslations from "./locales/en-common.json";
import ruTranslations from "./locales/ru.json";
import zhTranslations from "./locales/zh.json";
import zhCommonTranslations from "./locales/zh-common.json";
import zhControlsTranslations from "./locales/zh-controls.json";
import zhConsoleTranslations from "./locales/zh-console.json";
import zhLayoutTranslations from "./locales/zh-layout.json";
import zhLogsTranslations from "./locales/zh-logs.json";
import zhModsTranslations from "./locales/zh-mods.json";
import zhSavesTranslations from "./locales/zh-saves.json";
import zhServersettingsTranslations from "./locales/zh-serverSettings.json";
import zhServerversionTranslations from "./locales/zh-serverVersion.json";
import zhUsermanagementTranslations from "./locales/zh-userManagement.json";

const resources =
{
    en:
    {
        translation: enTranslations,
        common: enCommonTranslations,
    },
    ru:
    {
        translation: ruTranslations,
        common: enCommonTranslations,
    },
    zh:
    {
        translation: zhTranslations,
        common: zhCommonTranslations,
        controls: zhControlsTranslations,
        console: zhConsoleTranslations,
        layout: zhLayoutTranslations,
        logs: zhLogsTranslations,
        mods: zhModsTranslations,
        saves: zhSavesTranslations,
        serverSettings: zhServersettingsTranslations,
        serverVersion: zhServerversionTranslations,
        userManagement: zhUsermanagementTranslations,
    }
};

i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        ns: ["translation", "common", "controls", "console", "layout", "logs", "mods", "saves", "serverSettings", "serverVersion", "userManagement"],
        defaultNS: 'translation',
        resources,
        fallbackLng: "en", // Default Language
        // Detecting and caching of language cookies
        detection:
        {
            order: ["localStorage", "cookie", "navigator"],
            cache: ["localStorage", "cookie"]
        },
        interpolation:
        {
            escapeValue: false // react already safes from xss
        }
    });

export default i18n;