import Panel from "../../components/Panel";
import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import modsResource from "../../../api/resources/mods";
import Button from "../../components/Button";
import server from "../../../api/resources/server";
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

const Mods = ({serverStatus}) => {

    const { t } = useTranslation('mods');

    const [installedMods, setInstalledMods] = useState([]);
    const [modPacks, setModPacks] = useState([])
    const [factorioVersion, setFactorioVersion] = useState(null);
    const [fuse, setFuse] = useState(undefined);
    const [portalLoaded, setPortalLoaded] = useState(false);

    const loadPortalList = () => {
        if (portalLoaded) return;
        const cached = sessionStorage.getItem('mod_portal_cache');
        if (cached) {
            try {
                const {data, time} = JSON.parse(cached);
                if (Date.now() - time < 3600000) {
                    setFuse(new Fuse(data, {
                        keys: [{name: "name", weight: 2}, {name: "title", weight: 1}],
                        minMatchCharLength: 3
                    }));
                    setPortalLoaded(true);
                    return;
                }
            } catch(e) {}
        }
        setPortalLoaded(true);
        modsResource.portal.list()
            .then(res => {
                sessionStorage.setItem('mod_portal_cache', JSON.stringify({
                    data: res.results,
                    time: Date.now()
                }));
                setFuse(new Fuse(res.results, {
                    keys: [{name: "name", weight: 2}, {name: "title", weight: 1}],
                    minMatchCharLength: 3
                }));
            });
    };
    const [isDeletingAllMods, setIsDeletingAllMods] = useState(false);
    const [isUpdatingAllMods, setIsUpdatingAllMods] = useState(false);
    const [updatableMods, setUpdatableMods] = useState([]);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

    const addUpdatableMod = mod => {
        setUpdatableMods(mods => [...mods, mod])
    };

    const fetchInstalledMods = () => {
        modsResource.installed()
            .then(setInstalledMods);
    };

    const fetchModPacks = () => {
        modsResource.packs.list()
            .then(setModPacks)
    }

    const deleteAllMods = () => {
        setIsDeletingAllMods(true);
        modsResource.deleteAll()
            .then(fetchInstalledMods)
            .finally(() => setIsDeletingAllMods(false))
    }

    const updateAllMods = () => {
        setIsUpdatingAllMods(true);

        let promises = [];
        for (const updatableMod of updatableMods) {
            promises.push(modsResource.update(updatableMod))
        }

        Promise.all(promises)
            .then(fetchInstalledMods)
            .finally(() => setIsUpdatingAllMods(false));
    }

    useEffect(() => {
        server.factorioVersion()
            .then(data => {
                setFactorioVersion(data.base_mod_version)
                fetchInstalledMods();
                fetchModPacks();
            })


        const interval = setInterval(() => {
            if (document.hidden) return;
            fetchInstalledMods();
            fetchModPacks();
        }, 2000);

        const handleRefresh = () => {
            fetchInstalledMods();
            fetchModPacks();
        };
        window.addEventListener('fsm_refresh_mods', handleRefresh);

        return () => {
            clearInterval(interval);
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

    let disabled = serverStatus.running

    return (
        <div>
            {disabled ?
                <Panel className="mb-6"
                       content={
                            <div className="text-red font-bold text-xl">
                                {t('changingModsDisabled')}
                            </div>
                       }
                />
                :
                <TabControl>
                    <Tab title={t('installMod')} onActivate={loadPortalList}>
                        <AddMod refetchInstalledMods={fetchInstalledMods} fuse={fuse}/>
                    </Tab>
                    <Tab title={t('uploadMod')}>
                        <UploadMod refetchInstalledMods={fetchInstalledMods}/>
                    </Tab>
                    <Tab title={t('loadModsFromSave')}>
                        <LoadMods refreshMods={fetchInstalledMods}/>
                    </Tab>
                </TabControl>
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
                            !disabled &&
                            <Button size="sm" className="mr-2" isLoading={isUpdatingAllMods}
                                    onClick={updateAllMods}>{t('updateAllMods')}</Button>
                        }
                        {!disabled ? (
                            <>
                                <a className="bg-gray-light py-1 px-2 hover:glow-orange hover:bg-orange inline-block accentuated text-black font-bold"
                                   href={modsResource.downloadAllURL}>{t('downloadAllMods')}</a>
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
