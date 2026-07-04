import Panel from "../../components/Panel";
import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import modsResource from "../../../api/resources/mods";
import { useParams } from 'react-router-dom';
import Button from "../../components/Button";
import server from "../../../api/resources/server";
import socket from "../../../api/socket";
import TabControl from "../../components/Tabs/TabControl";
import Tab from "../../components/Tabs/Tab";
import AddMod from "./components/AddMod/AddMod";
import UploadMod from "./components/UploadMod";
import LoadMods from "./components/LoadMods";
import Fuse from "fuse.js";
import CreateModPack from "./components/CreateModPack";
import ModPack from "./components/ModPack";
import ModList from "./components/ModList";
import ConfirmDialog from "../../components/ConfirmDialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { useInstance } from '../../context/InstanceProvider';

const Mods = () => {
    const { name } = useParams();
    const mi = mi.forInstance(name);
    const { instanceStatus } = useInstance();
    const serverStatus = instanceStatus || {};

    const { t } = useTranslation('mods');

    const [installedMods, setInstalledMods] = useState([]);
    const [modPacks, setModPacks] = useState([])
    const [factorioVersion, setFactorioVersion] = useState(null);
    const [fuse, setFuse] = useState(undefined);
    const [portalLoading, setPortalLoading] = useState(false);
    const [isDeletingAllMods, setIsDeletingAllMods] = useState(false);
    const [isUpdatingAllMods, setIsUpdatingAllMods] = useState(false);
    const [updatableMods, setUpdatableMods] = useState([]);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
    const [isFactorioAuthenticated, setIsFactorioAuthenticated] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const addUpdatableMod = mod => {
        setUpdatableMods(mods => {
            if (mods.some(m => m.modName === mod.modName)) return mods;
            return [...mods, mod];
        });
    };

    const fetchInstalledMods = () => {
        return mi.installed()
            .then(setInstalledMods);
    };

    const fetchModPacks = () => {
        return mi.packs.list()
            .then(setModPacks)
    }

    const deleteAllMods = () => {
        setIsDeletingAllMods(true);
        mi.deleteAll()
            .then(fetchInstalledMods)
            .finally(() => setIsDeletingAllMods(false))
    }

    const updateAllMods = () => {
        setIsUpdatingAllMods(true);

        let promises = [];
        for (const updatableMod of updatableMods) {
            promises.push(mi.update(updatableMod))
        }

        Promise.all(promises)
            .then(fetchInstalledMods)
            .finally(() => setIsUpdatingAllMods(false));
    }

    useEffect(() => {
        mi.portal.status().then(auth => {
            setIsFactorioAuthenticated(auth);
            setAuthChecked(true);
        });
    }, []);

    useEffect(() => {
        server.factorioVersion()
            .then(data => {
                setFactorioVersion(data.base_mod_version)
                fetchInstalledMods();
                fetchModPacks();
            })

        setPortalLoading(true);
        mi.portal.list()
            .then(res => {
                setFuse(new Fuse(res.results, {
                    keys: [{name: "name", weight: 2}, {name: "title", weight: 1}],
                    minMatchCharLength: 3
                }));
            }).finally(() => setPortalLoading(false));

        const interval = setInterval(() => {
            if (document.hidden) return;
            fetchInstalledMods().catch(() => {});
            fetchModPacks().catch(() => {});
        }, 2000);

        const handleModEvent = (message) => {
            const data = JSON.parse(message);
            if (data.type === "mod_deleted") {
                setInstalledMods(prev => prev.filter(m => m.name !== data.name));
            } else if (data.type === "mods_cleared") {
                setInstalledMods([]);
            }
        };
        socket.on('mods_events', handleModEvent);
        socket.emit('mods events subscribe');

        const handleRefresh = () => {
            fetchInstalledMods().catch(() => {});
            fetchModPacks().catch(() => {});
        };
        window.addEventListener('fsm_refresh_mods', handleRefresh);

        return () => {
            clearInterval(interval);
            socket.off('mods_events', handleModEvent);
            socket.emit('mods events unsubscribe');
            window.removeEventListener('fsm_refresh_mods', handleRefresh);
        };
    }, []);

    const toggleMod = modName => {
        return modsResource
            .toggle(modName)
            .then(fetchInstalledMods)
    }

    const deleteMod = modName => {
        return modsResource
            .delete(modName)
            .then(fetchInstalledMods)
    }

    const updateMod = version => {
        return modsResource
            .update(version)
            .then(fetchInstalledMods)
    }

    const enableAllMods = () => {
        const toEnable = installedMods.filter(m => !m.enabled && m.name !== 'base');
        Promise.all(toEnable.map(m => toggleMod(m.name)))
            .then(fetchInstalledMods)
            .catch(() => fetchInstalledMods());
    }

    const disableAllMods = () => {
        const toDisable = installedMods.filter(m => m.enabled && m.name !== 'base');
        Promise.all(toDisable.map(m => toggleMod(m.name)))
            .then(fetchInstalledMods)
            .catch(() => fetchInstalledMods());
    }

    let disabled = serverStatus.running
    let isBusy = disabled || isDeletingAllMods || isUpdatingAllMods || isSyncing

    return (
        <div>
            {disabled && !isSyncing &&
                <Panel className="mb-6"
                       content={
                            <div className="text-red font-bold text-xl">
                                {t('changingModsDisabled')}
                            </div>
                       }
                />
            }
            {isSyncing &&
                <Panel className="mb-6"
                       content={
                            <div className="flex items-center justify-between">
                                <div className="text-orange font-bold text-xl">
                                    {t('syncingInProgress')}
                                </div>
                                <Button size="sm" type="danger" onClick={() => mi.cancelSync()}>
                                    取消同步
                                </Button>
                            </div>
                       }
                />
            }
            {!authChecked ? null :
                <div>
                    {portalLoading &&
                        <div className="mb-4 p-4 bg-gray-dark rounded-sm">
                            <div className="flex items-center text-dirty-white">
                                <FontAwesomeIcon icon={faSpinner} spin className="mr-2"/>
                                {t('loadingModList')}
                            </div>
                        </div>
                    }
                    <div className={portalLoading ? 'opacity-50 pointer-events-none' : ''}>
                        <TabControl>
                            <Tab title={t('installMod')}>
                                <AddMod refetchInstalledMods={fetchInstalledMods} fuse={fuse} loading={portalLoading}
                                        isFactorioAuthenticated={isFactorioAuthenticated} setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
                            </Tab>
                            <Tab title={t('uploadMod')}>
                                <UploadMod refetchInstalledMods={fetchInstalledMods} api={mi}/>
                            </Tab>
                            <Tab title={t('loadModsFromSave')}>
                                <LoadMods refreshMods={fetchInstalledMods}
                                          isFactorioAuthenticated={isFactorioAuthenticated}
                                          setIsFactorioAuthenticated={setIsFactorioAuthenticated}
                                          onSyncingChange={setIsSyncing} />
                            </Tab>
                        </TabControl>
                    </div>
                </div>
            }
            <Panel
                title={t('mods')}
                className="mb-6"
                content={
                    <ModList addUpdatableMod={addUpdatableMod}
                             toggleMod={toggleMod}
                             updateMod={updateMod}
                             deleteMod={deleteMod}
                             mods={installedMods}
                             factorioVersion={factorioVersion}
                             disabled={disabled}
                    />
                }
                actions={
                    <>
                         {
                            !isBusy &&
                            <Button size="sm" className="mr-2" isLoading={isUpdatingAllMods}
                                    onClick={updateAllMods}>{t('updateAllMods')}</Button>
                        }
                        {!isBusy ? (
                            <>
                                <a className="bg-gray-light py-1 px-2 hover:glow-orange hover:bg-orange inline-block accentuated text-black font-bold"
                                   href={mi.downloadAllURL}>{t('downloadAllMods')}</a>
                                <Button size="sm" className="ml-2" onClick={enableAllMods}>{t('enableAllMods')}</Button>
                                <Button size="sm" className="ml-2" onClick={disableAllMods}>{t('disableAllMods')}</Button>
                                <Button size="sm" type="danger" className="ml-2"
                                    isLoading={isDeletingAllMods}
                                    onClick={() => setShowDeleteAllConfirm(true)}>{t('deleteAllMods')}</Button>
                            </>
                        ) : (
                            <span className="text-gray-light text-sm italic">{t('changingModsDisabled')}</span>
                        )}
                    </>
                }
            />

            <Panel
                title={t('modPacks')}
                className="mb-6"
                content={
                    modPacks.map(
                        (pack, i) =>
                            <ModPack factorioVersion={factorioVersion}
                                     key={i}
                                     modPack={pack}
                                     reloadMods={fetchInstalledMods}
                                     reloadModPacks={fetchModPacks}
                                     disabled={disabled}
                            />
                    )
                }
                actions={
                    <CreateModPack onSuccess={fetchModPacks}/>
                }
            />
            <ConfirmDialog
                title={t('deleteAllMods')}
                content={t('confirmDeleteAllMods')}
                isOpen={showDeleteAllConfirm}
                close={() => setShowDeleteAllConfirm(false)}
                onSuccess={() => {
                    setShowDeleteAllConfirm(false);
                    deleteAllMods();
                }}
                closeImmediately={true}
            />
        </div>
    )
}

export default Mods;
