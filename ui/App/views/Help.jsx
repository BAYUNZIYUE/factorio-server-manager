import Panel from "../components/Panel";
import React, {useEffect, useState} from "react";
import { useTranslation, Trans } from "react-i18next";
import client from "../../api/client";
import serverResource from "../../api/resources/server";

const REPO = "https://github.com/joey00797-cell/factorio-server-manager";
const QUICK = ["qs1", "qs2", "qs3", "qs4", "qs5", "qs6", "qs7"];
const HOWTO = ["howto1", "howto2", "howto3", "howto4", "howto5", "howto6", "howto7"];
const PARTS = ["saves", "mods", "config", "logs"];
const NO_CHECKS = {saves: false, mods: false, config: false, logs: false, backups: false, full: false};

const Help = () => {
    const { t } = useTranslation();
    const [canInstall, setCanInstall] = useState(true);
    const [servers, setServers] = useState([]);
    const [serverId, setServerId] = useState("");
    const [checks, setChecks] = useState(NO_CHECKS);
    const [sure, setSure] = useState(false);
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        serverResource.info().then(info => setCanInstall(info.can_install !== false)).catch(() => {});
        serverResource.list().then(data => {
            const list = Array.isArray(data) ? data : (data && data.servers) || [];
            setServers(list);
            if (list.length > 0) setServerId(String(list[0].id));
        }).catch(() => {});
    }, []);

    const target = servers.find(s => String(s.id) === serverId);
    const anyChecked = Object.values(checks).some(Boolean);
    const canWipe = !!target && anyChecked && confirm === target.name && (!checks.backups || sure) && !busy;

    const wipe = async () => {
        setBusy(true);
        try {
            const res = await client.post(`/api/servers/${serverId}/wipe`, checks);
            const d = res.data || {};
            window.flash(t("help.dz_done") + ": " + Object.keys(d).map(k => `${k} (${d[k]})`).join(", "), "green");
            setConfirm("");
            setSure(false);
            if (checks.full) {
                const data = await serverResource.list();
                const list = Array.isArray(data) ? data : (data && data.servers) || [];
                setServers(list);
                setServerId(list.length > 0 ? String(list[0].id) : "");
                setChecks(NO_CHECKS);
            }
        } catch (e) {
            const msg = e.response && e.response.data ? JSON.stringify(e.response.data) : "";
            window.flash(t("help.dz_failed") + " " + msg, "red");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel
            title={t("help.title")}
            content={
                <>
                    <h1 className="text-xl text-dirty-white">{t("help.fsm")}</h1>
                    <p className="mb-2">{t("help.fsm_content")}</p>

                    <h2 className="text-dirty-white">{t("help.bugs_help")}</h2>
                    <p className="mb-4"><Trans i18nKey="help.bugs_help_content" components={[<a key="repo" className="text-blue hover:text-blue-light" target="_blank" rel="noreferrer" href={REPO + "/issues"}>x</a>]}/></p>

                    <h1 className="mb-1 text-xl text-dirty-white">{t("help.quickstart")}</h1>
                    <p className="mb-2">{t("help.quickstart_intro")}</p>
                    <div className="mb-4">
                        {QUICK.map((k, i) => (
                            <details key={k} className="mb-1 bg-gray-dark px-2 py-1" open={i === 0}>
                                <summary className="cursor-pointer select-none hover:text-orange">{i + 1}. {t(`help.${k}_title`)}</summary>
                                <p className="mt-1 mb-1">{k === "qs1" ? t(canInstall ? "help.qs1_text_linux" : "help.qs1_text_win") : t(`help.${k}_text`)}</p>
                            </details>
                        ))}
                    </div>

                    <h1 className="mb-1 text-xl text-dirty-white">{t("help.howto")}</h1>
                    <div className="mb-4">
                        {HOWTO.map(k => (
                            <details key={k} className="mb-1 bg-gray-dark px-2 py-1">
                                <summary className="cursor-pointer select-none hover:text-orange">{t(`help.${k}_title`)}</summary>
                                <p className="mt-1 mb-1">{t(`help.${k}_text`)}</p>
                            </details>
                        ))}
                    </div>

                    <h1 className="mb-1 text-xl text-dirty-white">{t("help.helpful_resources")}</h1>
                    <p className="mb-4"><a className="text-blue hover:text-blue-light" target="_blank" rel="noreferrer" href="https://wiki.factorio.com/Multiplayer">{t("help.factorio_link_text")}</a></p>

                    <details className="border border-red px-2 py-1">
                        <summary className="cursor-pointer select-none text-red font-bold">{t("help.dz_title")}</summary>
                        <div className="mt-2">
                            <p className="mb-2">{t("help.dz_desc")}</p>
                            <div className="mb-2">
                                <select className="text-black" value={serverId} onChange={e => { setServerId(e.target.value); setConfirm(""); }}>
                                    {servers.map(s => <option key={s.id} value={s.id}>{s.name} (#{s.id})</option>)}
                                </select>
                            </div>
                            {PARTS.map(key => (
                                <label key={key} className="block cursor-pointer">
                                    <input type="checkbox" className="mr-2" checked={checks[key] && !checks.full} disabled={checks.full}
                                           onChange={e => setChecks({...checks, [key]: e.target.checked})}/>
                                    {t(`help.dz_${key}`)}
                                </label>
                            ))}
                            <label className="block cursor-pointer mt-2 text-red font-bold">
                                <input type="checkbox" className="mr-2" checked={checks.full}
                                       onChange={e => setChecks({...checks, full: e.target.checked})}/>
                                {t("help.dz_full")}
                            </label>
                            <label className="block cursor-pointer text-red">
                                <input type="checkbox" className="mr-2" checked={checks.backups}
                                       onChange={e => { setChecks({...checks, backups: e.target.checked}); setSure(false); }}/>
                                {t("help.dz_backups")}
                            </label>
                            {checks.backups && (
                                <label className="block cursor-pointer ml-6 mt-1 border border-red px-2 py-1 text-red font-bold">
                                    <input type="checkbox" className="mr-2" checked={sure} onChange={e => setSure(e.target.checked)}/>
                                    {t("help.dz_sure")}
                                </label>
                            )}
                            <p className="mt-2 mb-1">{t("help.dz_type_before")}{target ? <b> {target.name} </b> : " "}{t("help.dz_type_after")}</p>
                            <input className="text-black px-1 mr-2" value={confirm} onChange={e => setConfirm(e.target.value)}/>
                            <button disabled={!canWipe} onClick={wipe}
                                    className={`px-2 py-1 font-bold text-black ${canWipe ? "bg-red cursor-pointer" : "bg-gray opacity-50 cursor-not-allowed"}`}>
                                {busy ? t("help.dz_working") : (checks.full ? t("help.dz_btn_delete") : t("help.dz_btn_wipe"))}
                            </button>
                        </div>
                    </details>
                </>
            }
        />
    )
}

export default Help;
