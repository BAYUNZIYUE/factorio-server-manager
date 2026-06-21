import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import savesResource from "../../../../api/resources/saves";
import Select from "../../../components/Select";
import Label from "../../../components/Label";
import {useForm} from "react-hook-form";
import Button from "../../../components/Button";
import modsResource from "../../../../api/resources/mods";
import modResource from "../../../../api/resources/mods";
import FactorioLogin from "./AddMod/components/FactorioLogin";
import ConfirmDialog from "../../../components/ConfirmDialog";
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

    useEffect(() => {
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
                if (data.type === 'progress') {
                    setInstallProgress({current: data.current, total: data.total});
                    setShowProgress(true);
                } else if (data.type === 'complete') {
                    setShowProgress(false);
                }
            } catch (e) {}
        };
        socket.on('mod_install', handleProgress);
        socket.emit('mod install subscribe');

        return () => {
            socket.off('mod_install', handleProgress);
        };
    }, []);

    const loadModsRequested = data => {
        setIsLoading(true);
        setLoadModsData(data);
    }

    const loadMods = async data => {
        try {
            await modResource.deleteAll();
            const result = await savesResource.mods(data.save);
            const mods = result?.mods || [];
            
            if (mods.length === 0) {
                window.flash(t('noModsFound', { ns: 'mods' }), "green");
                return;
            }

            await modResource.portal.installMultiple(mods);
            refreshMods();
            window.flash(t('modsLoaded').replace('{save}', data.save), "green");
        } catch (e) {
            window.flash(t('errorOccurred', { ns: 'common' }), "red");
        } finally {
            setIsLoading(false);
            setLoadModsData(undefined);
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
            <Button isSubmit={true} isDisabled={isDisabled} isLoading={isLoading}>{t('loadMods')}</Button>
            {showProgress && (
                <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-light mb-1">
                        <span>{t('installingMods', { ns: 'mods' })}</span>
                        <span>{installProgress.current}/{installProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-dark rounded h-2">
                        <div
                            className="bg-orange h-2 rounded transition-all duration-300"
                            style={{width: `${installProgress.total > 0 ? (installProgress.current / installProgress.total * 100) : 0}%`}}
                        />
                    </div>
                </div>
            )}
            <ConfirmDialog
                title={t('loadModsTitle')}
                content={t('deleteExistingMods')}
                isOpen={loadModsData !== undefined}
                close={() => {
                    setIsLoading(false);
                    setLoadModsData(undefined);
                }}
                onSuccess={() => loadMods(loadModsData)}
            />
        </form>
        : <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
}

export default LoadMods;
