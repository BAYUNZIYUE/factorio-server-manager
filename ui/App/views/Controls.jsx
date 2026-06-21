import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import Panel from "../components/Panel";
import Button from "../components/Button";
import server from "../../api/resources/server";
import savesResource from "../../api/resources/saves";
import {useForm} from "react-hook-form";
import Select from "../components/Select";
import Input from "../components/Input";
import Error from "../components/Error";

const Controls = ({serverStatus}) => {

    const { t } = useTranslation('controls');
    const savedIp = localStorage.getItem('fsm_ip') || '0.0.0.0';
    const savedPort = localStorage.getItem('fsm_port') || '34197';
    const factorioVersion = serverStatus.fac_version ? serverStatus.fac_version : t('UNKNOWN');
    const [saves, setSaves] = useState([]);
    const [isDisabled, setIsDisabled] = useState(true);
    const [isStopping, setIsStopping] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isKilling, setIsKilling] = useState(false);

    const { handleSubmit, reset, register, formState: {errors} } = useForm();

    const startServer = async (data) => {
        setIsStarting(true);
        localStorage.setItem('fsm_ip', data.ip);
        localStorage.setItem('fsm_port', data.port);
        await server.start(data.ip, parseInt(data.port), data.save);
    }

    const stopServer = async () => {
        setIsStopping(true);
        await server.stop();
    }

    const killServer = async () => {
        setIsKilling(true);
        await server.kill();
    }

    useEffect(() => {
        savesResource.list(true)
            .then(res => {
                setSaves(res);
                if (res.length > 0) {
                    setIsDisabled(undefined);
                }
                reset();
            });
    }, [])

    return (
        <form onSubmit={handleSubmit(startServer)}>
        <Panel
            title={t('serverStatus')}
            content={
                <div className="lg:flex">
                    { serverStatus.running
                        ? <>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('status')}</div>
                                <div>{serverStatus.running ? t('RUNNING') : t('STOPPED')}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('ip')}</div>
                                <div>{serverStatus.bindip}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('port')}</div>
                                <div>{serverStatus.port}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('factorioVersion')}</div>
                                <div>{factorioVersion}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('save')}</div>
                                <div>{serverStatus.savefile}</div>
                            </div>
                        </>
                        : <>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('status')}</div>
                                <div>{serverStatus.running ? t('RUNNING') : t('STOPPED')}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2 mr-0 lg:mr-4">
                                <div className="font-bold">{t('ip')}</div>
                                    <Input
                                        defaultValue={savedIp}
                                        disabled={isDisabled}
                                        register={register('ip',{required: true, pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/})}
                                    />
                                <Error error={errors.ip} message={t('ipRequired')}/>
                            </div>
                            <div className="lg:w-1/5 mb-2 mr-0 lg:mr-4">
                                <div className="font-bold">{t('port')}</div>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={65535}
                                        defaultValue={savedPort}
                                        disabled={isDisabled}
                                        register={register('port',{required: true, min: 1, max: 65535})}
                                    />
                                <Error error={errors.port} message={t('portRequired')}/>
                            </div>
                            <div className="lg:w-1/5 mb-2 mr-0 lg:mr-4">
                                <div className="font-bold">{t('factorioVersion')}</div>
                                <div>{factorioVersion}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">{t('save')}</div>
                                <div className="relative">
                                    <Select
                                        register={register('save',{required: true})}
                                        defaultValue={saves.find((save) => save.name.startsWith('Load Latest'))?.name}
                                        disabled={isDisabled}
                                        options={saves.map(save => new Object({
                                            value: save.name,
                                            name: save.name
                                        }))}
                                    />
                                    <Error error={errors.save} message={t('saveRequired')}/>
                                </div>
                            </div>
                        </>
                    }
                </div>
            }
            actions={
                <div className="md:flex">
                    {serverStatus.running
                        ? <>
                            <Button onClick={stopServer} isLoading={isStopping} isDisabled={isKilling} size="sm" className="w-full md:w-auto mb-2 md:mb-0 md:mr-2" type="default">{t('saveStopServer')}</Button>
                            <Button onClick={killServer} isLoading={isKilling} isDisabled={isStopping} size="sm" type="danger" className="w-full md:w-auto">{t('killServer')}</Button>
                        </>
                        : <Button isSubmit={true} isDisabled={isDisabled} isLoading={isStarting} size="sm" type="success" className="w-full md:w-auto">{t('startServer')}</Button>
                    }
                </div>
            }
        />
        </form>
    )
};

export default Controls;
