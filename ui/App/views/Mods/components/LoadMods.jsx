import React, {useEffect, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import savesResource from "../../../../api/resources/saves";
import Select from "../../../components/Select";
import Label from "../../../components/Label";
import {useForm} from "react-hook-form";
import Button from "../../../components/Button";
import modsResource from "../../../../api/resources/mods";
import modResource from "../../../../api/resources/mods";
import FactorioLogin from "./AddMod/components/FactorioLogin";
import Modal from "../../../components/Modal";
import socket from "../../../../api/socket";

const LoadMods = ({refreshMods}) => {

    const { t } = useTranslation(['mods', 'common']);
    const [saves, setSaves] = useState([]);
    const {register, reset, handleSubmit} = useForm();
    const [isLoading, setIsLoading] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const [isFactorioAuthenticated, setIsFactorioAuthenticated] = useState(false);
    const [loadModsData, setLoadModsData] = useState(undefined);
    const [installProgress, setInstallProgress] = useState({current: 0, total: 0});
    const [showProgress, setShowProgress] = useState(false);
    const progressTimer = useRef(null);
    const [activeCount, setActiveCount] = useState(0);
    const [completedNames, setCompletedNames] = useState([]);
    const [workerStates, setWorkerStates] = useState({});
    const [modList, setModList] = useState([]);
    const [selectedMods, setSelectedMods] = useState(new Set());
    const [showModList, setShowModList] = useState(false);

    useEffect(() => {
        localStorage.removeItem('mod_install_pending');
        localStorage.removeItem('mod_install_done');
        setShowProgress(false);
        setWorkerStates({});
        setActiveCount(0);

        (async () => {
            setIsFactorioAuthenticated(await modResource.portal.status())

            const s = await savesResource.list()
            setSaves(s);
            if (s.length > 0) {
                setIsDisabled(false);
            }
            reset();
        })();

        const handleProgress = (msg) => {
            try {
                const data = JSON.parse(typeof msg === 'string' ? msg : JSON.stringify(msg));
                if (data.type === 'start') {
                    setInstallProgress({current: 0, total: data.total});
                    setShowProgress(true);
                    setActiveCount(0);
                    setCompletedNames([]);
                    clearTimeout(progressTimer.current);
                } else if (data.type === 'progress') {
                    setInstallProgress({current: data.current, total: data.total});
                    setActiveCount(data.active || 0);
                    clearTimeout(progressTimer.current);
                    progressTimer.current = setTimeout(() => {
                        setShowProgress(false);
                        setWorkerStates({});
                        setActiveCount(0);
                    }, 60 * 1000);
                } else if (data.type === 'worker') {
                    setWorkerStates(prev => ({
                        ...prev,
                        [data.worker]: {
                            name: data.name,
                            state: data.state,
                            size: data.size || 0
                        }
                    }));
                } else if (data.type === 'complete') {
                    setShowProgress(false);
                    setActiveCount(0);
                    setWorkerStates({});
                    clearTimeout(progressTimer.current);
                }
            } catch (e) {}
        };
        socket.on('mod_install', handleProgress);
        socket.emit('mod install subscribe');

        return () => {
            socket.off('mod_install', handleProgress);
            clearTimeout(progressTimer.current);
        };
    }, []);

    const loadModsRequested = async data => {
        setIsLoading(true);
        const result = await savesResource.mods(data.save);
        const mods = result?.mods || [];
        
        if (mods.length === 0) {
            window.flash(t('noModsFound', { ns: 'mods' }), "green");
            setIsLoading(false);
            return;
        }

        setModList(mods.filter(m => m.name !== 'base'));
        setSelectedMods(new Set(mods.filter(m => m.name !== 'base').map(m => m.name)));
        setLoadModsData(data);
        setShowModList(true);
        setIsLoading(false);
    }

    const toggleMod = (name) => {
        const next = new Set(selectedMods);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setSelectedMods(next);
    }

    const selectAll = () => {
        setSelectedMods(new Set(modList.map(m => m.name)));
    }

    const deselectAll = () => {
        setSelectedMods(new Set());
    }

    const loadMods = async () => {
        const data = loadModsData;
        setShowModList(false);
        setLoadModsData(undefined);
        setIsLoading(true);

        try {
            await modResource.deleteAll();
            const toInstall = modList.filter(m => selectedMods.has(m.name));
            
            if (toInstall.length === 0) {
                window.flash(t('noModsSelected', { ns: 'mods' }), "gray-light");
                return;
            }

            await modResource.portal.installMultiple(toInstall);
            refreshMods();
            window.flash(t('modsLoaded').replace('{save}', data.save), "green");
        } catch (e) {
            window.flash(t('errorOccurred', { ns: 'common' }), "red");
        } finally {
            setIsLoading(false);
            setShowProgress(false);
        }
    }

    return isFactorioAuthenticated
        ? <form onSubmit={handleSubmit(loadModsRequested)}>
            <Label text={t('save', { ns: 'common' })} htmlFor="save"/>
            <Select
                register={register('save')}
                className="mb-4"
                disabled={isDisabled}
                options={saves?.map(save => new Object({
                    name: save.name,
                    value: save.name
                }))}
            />
            <div className="flex space-x-2">
                <Button isSubmit={true} isDisabled={isDisabled || isLoading}>{t('loadMods')}</Button>
                {showProgress && (
                    <Button type="danger" onClick={() => window.location.reload()}>{t('cancel', { ns: 'common' })}</Button>
                )}
            </div>
            {showProgress && (
                <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-light mb-1">
                        <span>{t('installingMods', { ns: 'mods' })} ({activeCount} workers)</span>
                        <span>{installProgress.current}/{installProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-dark rounded h-2 mb-3">
                        <div
                            className="bg-green h-2 rounded transition-all duration-300"
                            style={{width: `${installProgress.total > 0 ? (installProgress.current / installProgress.total * 100) : 0}%`}}
                        />
                    </div>
                    {[0,1,2,3,4].map(w => {
                        const ws = workerStates[w];
                        if (!ws) return null;
                        const icon = ws.state === 'done' ? '✓' : ws.state === 'error' ? '✗' : '↓';
                        const color = ws.state === 'done' ? 'text-green' : ws.state === 'error' ? 'text-red' : 'text-orange';
                        const sizeText = ws.size > 0 ? ` (${(ws.size / 1024).toFixed(0)}KB)` : '';
                        return (
                            <div key={w} className="flex items-center text-xs">
                                <span className={`${color} w-4`}>{icon}</span>
                                <span className="text-gray-light truncate">{ws.name}{sizeText}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            <Modal
                title={t('loadModsTitle')}
                isOpen={showModList}
                content={
                    <div>
                        <p className="mb-3 text-sm">{t('selectModsToInstall', { ns: 'mods' })}</p>
                        <div className="flex space-x-2 mb-3">
                            <Button size="sm" onClick={selectAll}>{t('selectAll', { ns: 'mods' })}</Button>
                            <Button size="sm" onClick={deselectAll}>{t('deselectAll', { ns: 'mods' })}</Button>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full">
                                <tbody>
                                    {modList.map(mod => (
                                        <tr key={mod.name} className="border-b border-gray-light cursor-pointer hover:bg-gray-dark"
                                            onClick={() => toggleMod(mod.name)}>
                                            <td className="py-1 pr-2">
                                                <input type="checkbox" checked={selectedMods.has(mod.name)} readOnly
                                                    className="cursor-pointer" />
                                            </td>
                                            <td className="py-1 text-dirty-white">{mod.name}</td>
                                            <td className="py-1 text-gray-light text-sm text-right">{mod.version}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                }
                actions={
                    <div className="flex space-x-2">
                        <Button size="sm" type="danger" onClick={() => { setShowModList(false); setLoadModsData(undefined); }}>
                            {t('cancel', { ns: 'common' })}
                        </Button>
                        <Button size="sm" type="success" onClick={loadMods}>
                            {t('installSelected', { ns: 'mods' }).replace('{count}', selectedMods.size)}
                        </Button>
                    </div>
                }
            />
        </form>
        : <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
}

export default LoadMods;
