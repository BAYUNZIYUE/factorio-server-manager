import React, {useEffect, useState} from "react";
import savesResource from "../../../../api/resources/saves";
import Label from "../../../components/Label";
import Button from "../../../components/Button";
import modsResource from "../../../../api/resources/mods";
import FactorioLogin from "./AddMod/components/FactorioLogin";
import socket from "../../../../api/socket";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTranslation} from "react-i18next";
import {faSpinner, faCheck, faTimes, faMinusCircle} from "@fortawesome/free-solid-svg-icons";

const DLC_MODS = new Set(['elevated-rails', 'quality', 'space-age']);

const STATUS_ICON = {
    downloading:   <FontAwesomeIcon icon={faSpinner} spin={true} className="text-orange"/>,
    downloaded:    <FontAwesomeIcon icon={faCheck} className="text-green"/>,
    installed:     <FontAwesomeIcon icon={faCheck} className="text-green"/>,
    wrong_version: <FontAwesomeIcon icon={faCheck} className="text-yellow-500"/>,
    missing:       <FontAwesomeIcon icon={faTimes} className="text-red"/>,
    builtin:       <FontAwesomeIcon icon={faMinusCircle} className="text-blue-400"/>,
    not_found:     <FontAwesomeIcon icon={faTimes} className="text-red"/>,
};

const LoadMods = ({refreshMods, isFactorioAuthenticated, setIsFactorioAuthenticated}) => {
    const {t} = useTranslation('mods');
    const [saves, setSaves] = useState([]);
    const [selectedSave, setSelectedSave] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const [modRows, setModRows] = useState([]);
    const [checkedMods, setCheckedMods] = useState({});
    const [syncError, setSyncError] = useState(null);
    const [currentMod, setCurrentMod] = useState(null);
    const [warning, setWarning] = useState(null);

    useEffect(() => {
        (async () => {
            if (!isFactorioAuthenticated) {
                setIsFactorioAuthenticated(await modsResource.portal.status());
            }
            const s = await savesResource.list();
            setSaves(s);
            if (s.length > 0) {
                setIsDisabled(false);
                setSelectedSave(s[0].name);
            }
        })();
    }, []);

    useEffect(() => {
        const handler = (message) => {
            const data = JSON.parse(message);
            if (data.status === "progress") {
                setCurrentMod(data.mod);
                setModRows(rows => rows.map(r =>
                    r.name === data.mod ? {...r, status: "downloading"} : r
                ));
            } else if (data.status === "done") {
                setIsSyncing(false);
                setCurrentMod(null);
                setWarning(data.warning || null);
                if (data.mods) {
                    setModRows(data.mods);
                    setCheckedMods({});
                }
                refreshMods();
            } else if (data.status === "error") {
                setIsSyncing(false);
                setCurrentMod(null);
                setSyncError(data.message);
            }
        };

        socket.on('mods_sync', handler);
        socket.emit('mods sync subscribe');
        return () => {
            socket.off('mods_sync', handler);
            socket.emit('mods sync unsubscribe');
        };
    }, []);

    const onReadSave = async () => {
        if (!selectedSave) return;
        setIsLoading(true);
        setModRows([]);
        setCheckedMods({});
        setSyncError(null);
        setWarning(null);

        try {
            const mods = await modsResource.getFromSave(selectedSave);
            setModRows(mods || []);
            const checked = {};
            (mods || []).forEach(m => {
                if (m.status === 'missing' || m.status === 'wrong_version') {
                    checked[m.name] = true;
                }
            });
            setCheckedMods(checked);
        } catch(e) {
            setSyncError(t('failedToReadSave') + ': ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const onSync = async () => {
        const toSync = Object.keys(checkedMods).filter(k => checkedMods[k]);
        if (toSync.length === 0) return;

        setIsSyncing(true);
        setSyncError(null);
        try {
            await modsResource.syncFromSave(selectedSave, toSync);
        } catch (e) {
            setSyncError(t('failedToStartSync') + ': ' + e.message);
            setIsSyncing(false);
        }
    };

    const selectMissing = () => {
        const checked = {};
        modRows.forEach(m => {
            if (m.status !== 'builtin' && m.status !== 'installed') {
                checked[m.name] = true;
            }
        });
        setCheckedMods(checked);
    };

    const clearAll = () => setCheckedMods({});

    const checkedCount = Object.values(checkedMods).filter(Boolean).length;

    if (!isFactorioAuthenticated) {
        return <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>;
    }

    return (
        <div>
            <Label text={t('save')} htmlFor="save"/>
            <select
                className="shadow appearance-none border w-full py-2 px-3 text-black mb-4"
                disabled={isDisabled}
                value={selectedSave}
                onChange={e => { setSelectedSave(e.target.value); setModRows([]); setCheckedMods({}); }}
            >
                {saves?.map(save => (
                    <option key={save.name} value={save.name}>{save.name}</option>
                ))}
            </select>

            <Button
                isDisabled={isDisabled || isLoading}
                isLoading={isLoading}
                onClick={onReadSave}
                className="mr-2"
            >
                {t('readModsFromSave')}
            </Button>

            {syncError && (
                <div className="mt-4 p-3 bg-red-100 text-red font-bold">
                    ⚠ {syncError}
                </div>
            )}

            {warning && (
                <div className="mt-4 p-3 bg-yellow-100 text-yellow-800">
                    ⚠ {warning}
                </div>
            )}

            {modRows.length > 0 && (
                <div className="mt-4">
                    <div className="flex mb-2 gap-2">
                        <Button size="sm" onClick={selectMissing}>{t('selectMissing')}</Button>
                        <Button size="sm" onClick={clearAll}>{t('clearSelection')}</Button>
                        <Button
                            size="sm"
                            isDisabled={checkedCount === 0 || isSyncing}
                            isLoading={isSyncing}
                            onClick={onSync}
                        >
                            {t('syncSelected')} ({checkedCount})
                        </Button>
                    </div>

                    {currentMod && (
                        <div className="mb-2 text-sm text-orange">
                            <FontAwesomeIcon icon={faSpinner} spin={true} className="mr-2"/>
                            {t('downloadingStatus')}: {currentMod}
                        </div>
                    )}

                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b font-bold">
                                <td className="py-1 pr-2 w-6"></td>
                                <td className="py-1 pr-4">{t('mod')}</td>
                                <td className="py-1 pr-4">{t('required')}</td>
                                <td className="py-1 pr-4">{t('installed')}</td>
                                <td className="py-1">{t('status')}</td>
                            </tr>
                        </thead>
                        <tbody>
                            {modRows.map(mod => (
                                <tr key={mod.name} className="border-b">
                                    <td className="py-1 pr-2">
                                        {mod.status === 'builtin' ? null : (
                                            <input
                                                type="checkbox"
                                                checked={!!checkedMods[mod.name]}
                                                onChange={() => {
                                                    setCheckedMods(prev => ({
                                                        ...prev,
                                                        [mod.name]: !prev[mod.name]
                                                    }));
                                                }}
                                            />
                                        )}
                                    </td>
                                    <td className="py-1 pr-4">
                                        {mod.name}
                                        {DLC_MODS.has(mod.name) && (
                                            <span className="ml-1 text-xs text-blue-600">DLC</span>
                                        )}
                                    </td>
                                    <td className="py-1 pr-4">{mod.version_required || mod.version}</td>
                                    <td className="py-1 pr-4">{mod.version_installed || '-'}</td>
                                    <td className="py-1">
                                        {STATUS_ICON[mod.status] || mod.status}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default LoadMods;
