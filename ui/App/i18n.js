import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from 'i18next-http-backend'
import LanguageDetector from "i18next-browser-languagedetector";
import enTranslations from "./locales/en.json";
import enCommonTranslations from "./locales/en-common.json";
import ruTranslations from "./locales/ru.json";
import zhTranslations from "./locales/zh.json";
import zhCommonTranslations from "./locales/zh-common.json";

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
    }
};

i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        ns: ['translation', 'common'],
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