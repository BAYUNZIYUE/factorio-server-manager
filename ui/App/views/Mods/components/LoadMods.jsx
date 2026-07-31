import React, {useEffect, useState, useRef} from "react";
import savesResource from "../../../../api/resources/saves";
import Label from "../../../components/Label";
import Button from "../../../components/Button";
import modsResource from "../../../../api/resources/mods";
import FactorioLogin from "./AddMod/components/FactorioLogin";
import socket from "../../../../api/socket";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTranslation} from "react-i18next";
import {faSpinner, faCheck, faTimes, faMinusCircle, faChevronDown, faChevronUp, faClock} from "@fortawesome/free-solid-svg-icons";

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

const formatSize = (bytes) => {
    if (!bytes || bytes < 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

const formatTime = (seconds) => {
    if (!seconds || seconds < 0 || !isFinite(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const LoadMods = ({refreshMods, isFactorioAuthenticated, setIsFactorioAuthenticated, onSyncingChange, savesApi}) => {
    const {t} = useTranslation('mods');
    const [saves, setSaves] = useState([]);
    const [selectedSave, setSelectedSave] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const [modRows, setModRows] = useState([]);
    const [checkedMods, setCheckedMods] = useState({});
    const [syncError, setSyncError] = useState(null);
    const [warning, setWarning] = useState(null);
    const [modProgress, setModProgress] = useState({});
    const [expanded, setExpanded] = useState(false);
    const [tick, setTick] = useState(0);
    const recoveringRef = useRef(false);
    const modRowsRef = useRef(modRows);
    modRowsRef.current = modRows;
    const delayTimers = useRef({});

    useEffect(() => {
        if (!isSyncing) return;
        const id = setInterval(() => setTick(t => t + 1), 500);
        return () => clearInterval(id);
    }, [isSyncing]);

    useEffect(() => {
        (async () => {
            if (!isFactorioAuthenticated) {
                setIsFactorioAuthenticated(await modsResource.portal.status());
            }
            const s = await (savesApi || savesResource).list();
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
            if (modRowsRef.current.length === 0 && data.status && data.status !== "done" && data.status !== "error") {
                if (recoveringRef.current) return;
                recoveringRef.current = true;
                const saved = sessionStorage.getItem('fsm_sync_save');
                if (saved && selectedSave !== saved) {
                    setSelectedSave(saved);
                }
                setIsSyncing(true);
                if (onSyncingChange) onSyncingChange(true);
                if (saved) {
                    modsResource.getFromSave(saved).then(mods => {
                        setModRows(prev => {
                            if (prev.length > 0) return prev;
                            return mods || [];
                        });
                    }).catch(() => {}).finally(() => {
                        recoveringRef.current = false;
                    });
                } else {
                    recoveringRef.current = false;
                }
            }
            if (data.status === "progress") {
                setModRows(rows => rows.map(r =>
                    r.name === data.mod ? {...r, status: "downloading"} : r
                ));

                const now = Date.now();
                const bytes = data.downloaded || 0;

                setModProgress(prev => {
                    const existing = prev[data.mod] || {};
                    const startedAt = existing.startedAt || now;
                    const elapsed = (now - startedAt) / 1000;
                    const speed = elapsed > 0.1 ? Math.round(bytes / elapsed) : 0;

                    return {
                        ...prev,
                        [data.mod]: {
                            downloaded: bytes,
                            size: data.size || existing.size || 0,
                            speed,
                            startedAt,
                        }
                    };
                });
            } else if (data.status === "downloaded") {
                setModRows(rows => rows.map(r =>
                    r.name === data.mod ? {...r, status: "downloaded"} : r
                ));
                if (delayTimers.current[data.mod]) clearTimeout(delayTimers.current[data.mod]);
                delayTimers.current[data.mod] = setTimeout(() => {
                    setModRows(rows => rows.map(r =>
                        r.name === data.mod && r.status === "downloaded" ? {...r, status: "done_delayed"} : r
                    ));
                    delete delayTimers.current[data.mod];
                }, 2000);
            } else if (data.status === "not_found") {
                setModRows(rows => rows.map(r =>
                    r.name === data.mod ? {...r, status: "not_found"} : r
                ));
            } else if (data.status === "builtin") {
                setModRows(rows => rows.map(r =>
                    r.name === data.mod ? {...r, status: "builtin"} : r
                ));
            } else if (data.status === "version_mismatch") {
                let latestInfo = {latest: '?', downloadUrl: '', fileName: ''};
                try { latestInfo = JSON.parse(data.message || '{}'); } catch(e) {}
                setModRows(rows => rows.map(r =>
                    r.name === data.mod ? {...r, status: "version_mismatch", latestInfo} : r
                ));
            } else if (data.status === "done") {
                setIsSyncing(false);
                if (onSyncingChange) onSyncingChange(false);
                sessionStorage.removeItem('fsm_sync_save');
                setWarning(data.warning || null);
                setExpanded(false);
                if (data.mods) {
                    setModRows(data.mods);
                    setCheckedMods({});
                }
                refreshMods();
            } else if (data.status === "error") {
                setIsSyncing(false);
                if (onSyncingChange) onSyncingChange(false);
                setSyncError(data.message);
                setExpanded(false);
            }
        };

        socket.on('mods_sync', handler);
        socket.emit('mods sync subscribe');
        return () => {
            socket.off('mods_sync', handler);
            socket.emit('mods sync unsubscribe');
            recoveringRef.current = false;
            Object.values(delayTimers.current).forEach(clearTimeout);
            delayTimers.current = {};
            if (onSyncingChange) onSyncingChange(false);
        };
    }, []);

    const onReadSave = async () => {
        if (!selectedSave) return;
        setIsLoading(true);
        setModRows([]);
        setCheckedMods({});
        setSyncError(null);
        setWarning(null);
        setModProgress({});
        setExpanded(false);

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
        if (onSyncingChange) onSyncingChange(true);
        sessionStorage.setItem('fsm_sync_save', selectedSave);
        setSyncError(null);
        setExpanded(false);
        try {
            await modsResource.syncFromSave(selectedSave, toSync);
        } catch (e) {
            setSyncError(t('failedToStartSync') + ': ' + e.message);
            setIsSyncing(false);
            if (onSyncingChange) onSyncingChange(false);
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

    if (isSyncing && modRows.length > 0) {
        const now = Date.now();
        const downloading = modRows.filter(r => r.status === 'downloading');
        const downloaded = modRows.filter(r => r.status === 'downloaded');
        const failed = modRows.filter(r => r.status === 'not_found');
        const total = modRows.length;
        const pending = total - downloading.length - downloaded.length - failed.length;

        const sorted = [...modRows].sort((a, b) => {
            const o = {downloading: 0, downloaded: 1};
            return (o[a.status] ?? 2) - (o[b.status] ?? 2);
        });

        return (
            <div>
                <Label text={t('save')} htmlFor="save"/>
                <select
                    className="shadow appearance-none border w-full py-2 px-3 text-black mb-4 opacity-50"
                    disabled={true}
                    value={selectedSave}
                >
                    {saves?.map(save => (
                        <option key={save.name} value={save.name}>{save.name}</option>
                    ))}
                </select>

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

                <div className="mt-4">
                    <div className="flex items-center gap-4 mb-3 p-2 bg-gray-dark rounded text-sm">
                        <span className="text-orange font-bold">
                            ⬇ {downloading.length} {t('active') || '进行中'}
                        </span>
                        <span className="text-green">
                            ✅ {downloaded.length} {t('completed') || '已完成'}
                        </span>
                        <span className="text-gray-light">
                            ⏳ {pending} {t('pending') || '等待中'}
                        </span>
                        {failed.length > 0 && (
                            <span className="text-red">
                                ❌ {failed.length} {t('failed') || '失败'}
                            </span>
                        )}
                        <span className="text-gray-light ml-auto">
                            {downloaded.length + downloading.length}/{total}
                        </span>
                    </div>

                    {downloading.length > 0 && (
                        <div className="mb-3">
                            <div className="text-xs text-gray-light mb-1 uppercase tracking-wide">
                                {t('downloading') || '下载中'}
                            </div>
                            {downloading.map(mod => {
                                const mp = modProgress[mod.name] || {};
                                const pct = mp.size ? Math.min(100, ((mp.downloaded || 0) / mp.size) * 100) : 0;
                                const elapsed = mp.startedAt ? (now - mp.startedAt) / 1000 : 0;
                                const eta = mp.speed > 0 ? ((mp.size - (mp.downloaded || 0)) / mp.speed) : 0;

                                return (
                                    <div key={mod.name} className="mb-2 p-3 bg-gray-dark rounded border border-gray-medium">
                                        <div className="flex items-center gap-2 mb-1">
                                            <FontAwesomeIcon icon={faSpinner} spin={true} className="text-orange text-sm"/>
                                            <span className="text-white font-bold text-sm">{mod.name}</span>
                                            <span className="text-xs text-orange ml-auto">
                                                {formatSize(mp.speed || 0)}/s
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-medium rounded-full h-2 overflow-hidden mb-1">
                                            <div
                                                className="bg-orange h-2 rounded-full transition-all duration-300"
                                                style={{width: `${Math.max(pct, 2)}%`}}
                                            />
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-light">
                                            <span>{formatSize(mp.downloaded || 0)} / {formatSize(mp.size || 0)}</span>
                                            <span>{pct.toFixed(0)}%</span>
                                            <span>
                                                <FontAwesomeIcon icon={faClock} className="mr-1"/>
                                                {formatTime(elapsed)} / {formatTime(eta)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!expanded && (downloaded.length + pending + failed.length) > 0 && (
                        <div className="mb-2">
                            <button
                                className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                                onClick={() => setExpanded(true)}
                            >
                                <FontAwesomeIcon icon={faChevronDown}/>
                                {t('expandAll') || '展开全部'} ({total - downloading.length})
                            </button>
                        </div>
                    )}

                    {expanded && (
                        <div>
                            <button
                                className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 mb-2"
                                onClick={() => setExpanded(false)}
                            >
                                <FontAwesomeIcon icon={faChevronUp}/>
                                {t('collapseAll') || '收起全部'}
                            </button>
                            <div className="max-h-64 overflow-y-auto">
                                {sorted.map(mod => (
                                    <div key={mod.name} className="flex items-center gap-3 py-1.5 px-2 border-b border-gray-dark text-sm">
                                        <span className="w-5 text-center">{STATUS_ICON[mod.status]}</span>
                                        <span className="flex-1 truncate">{mod.name}</span>
                                        {modProgress[mod.name] && (
                                            <span className="text-xs text-gray-light w-28 text-right">
                                                {formatSize(modProgress[mod.name].downloaded || 0)} / {formatSize(modProgress[mod.name].size || 0)}
                                            </span>
                                        )}
                                        {!modProgress[mod.name] && mod.status !== 'downloading' && (
                                            <span className="text-xs text-gray-light w-28 text-right">
                                                {mod.status === 'downloaded' ? '✅ 完成' :
                                                 mod.status === 'not_found' ? '❌ 失败' :
                                                 mod.status === 'builtin' ? '内置' :
                                                 mod.status === 'version_mismatch' ? `⚠️ v${mod.latestInfo?.latest || '?'}` : ''}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
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

                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b font-bold">
                                <td className="py-1 pr-2 w-6"></td>
                                <td className="py-1 pr-4">{t('mod')}</td>
                                <td className="py-1 pr-4">{t('required')}</td>
                                <td className="py-1 pr-4">{t('installed')}</td>
                                <td className="py-1 pr-4" style={{width: 120}}>{t('status')}</td>
                                <td className="py-1" style={{width: 80}}></td>
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
                                    <td className="py-1 pr-4">
                                        <span className="flex items-center gap-1">
                                            {STATUS_ICON[mod.status] || mod.status}
                                        </span>
                                    </td>
                                    <td className="py-1">
                                        {mod.status === 'version_mismatch' && mod.latestInfo && (
                                            <Button size="sm" onClick={() => {
                                                modsResource.update({
                                                    modName: mod.name,
                                                    downloadUrl: mod.latestInfo.downloadUrl,
                                                    fileName: mod.latestInfo.fileName
                                                }).then(() => refreshMods());
                                            }}>
                                                下载最新版 v{mod.latestInfo.latest || '?'}
                                            </Button>
                                        )}
                                        {mod.status !== 'version_mismatch' && mod.file_size > 0 && (
                                            <span className="text-xs text-gray-light">{((mod.file_size || 0) / 1024).toFixed(0)} KB</span>
                                        )}
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
