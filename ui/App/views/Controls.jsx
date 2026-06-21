import React, {useEffect, useState} from "react";
import Panel from "../components/Panel";
import Button from "../components/Button";
import server from "../../api/resources/server";
import savesResource from "../../api/resources/saves";
import {useForm} from "react-hook-form";
import Select from "../components/Select";
import Input from "../components/Input";
import Error from "../components/Error";

const Controls = ({serverStatus}) => {

    const factorioVersion = serverStatus.fac_version ? serverStatus.fac_version : 'Unknown';
    const [availableVersions, setAvailableVersions] = useState({});
    const [isInstalling, setIsInstalling] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState('stable');

    useEffect(() => {
        server.availableVersions()
            .then(res => setAvailableVersions(res));
    }, []);

    const installVersion = async () => {
        setIsInstalling(true);
        await server.installVersion(selectedVersion);
        setIsInstalling(false);
    }

    const removeInstallation = async () => {
        setIsRemoving(true);
        await server.removeInstallation();
        setIsRemoving(false);
    }
    const [saves, setSaves] = useState([]);
    const [isDisabled, setIsDisabled] = useState(true);
    const [isStopping, setIsStopping] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isKilling, setIsKilling] = useState(false);

    const { handleSubmit, reset, register, formState: {errors} } = useForm();

    const startServer = async (data) => {
        setIsStarting(true);
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
            title="Server Status"
            content={
                <div className="lg:flex">
                    { serverStatus.running
                        ? <>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">Status</div>
                                <div>{serverStatus.running ? 'Running' : 'Stopped'}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">IP</div>
                                <div>{serverStatus.bindip}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">Port</div>
                                <div>{serverStatus.port}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">Factorio Version</div>
                                <div>{factorioVersion}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">Save</div>
                                <div>{serverStatus.savefile}</div>
                            </div>
                        </>
                        : <>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">Status</div>
                                <div>{serverStatus.running ? 'Running' : 'Stopped'}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2 mr-0 lg:mr-4">
                                <div className="font-bold">IP</div>
                                <Input
                                    defaultValue={"0.0.0.0"}
                                    disabled={isDisabled}
                                    register={register('ip',{required: true, pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/})}
                                />
                                <Error error={errors.ip} message="IP is required and must be valid."/>
                            </div>
                            <div className="lg:w-1/5 mb-2 mr-0 lg:mr-4">
                                <div className="font-bold">Port</div>
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    defaultValue={"34197"}
                                    disabled={isDisabled}
                                    register={register('port',{required: true, min: 1, max: 65535})}
                                />
                                <Error error={errors.port} message="Port is required within range 1-65535"/>
                            </div>
                            <div className="lg:w-1/5 mb-2 mr-0 lg:mr-4">
                                <div className="font-bold">Factorio Version</div>
                                <div>{factorioVersion}</div>
                            </div>
                            <div className="lg:w-1/5 mb-2">
                                <div className="font-bold">Save</div>
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
                                    <Error error={errors.save} message="Save is required and must be valid."/>
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
                            <Button onClick={stopServer} isLoading={isStopping} isDisabled={isKilling} size="sm" className="w-full md:w-auto mb-2 md:mb-0 md:mr-2" type="default">Save & Stop Server</Button>
                            <Button onClick={killServer} isLoading={isKilling} isDisabled={isStopping} size="sm" type="danger" className="w-full md:w-auto">Kill Server</Button>
                        </>
                        : <Button isSubmit={true} isDisabled={isDisabled} isLoading={isStarting} size="sm" type="success" className="w-full md:w-auto">Start Server</Button>
                    }
                </div>
            }
        />
        <Panel
            title="Factorio Installation"
            content={
                <div className="lg:flex">
                    <div className="lg:w-1/4 mb-2 mr-0 lg:mr-4">
                        <div className="font-bold">Installed Version</div>
                        <div>{factorioVersion}</div>
                    </div>
                    <div className="lg:w-1/4 mb-2 mr-0 lg:mr-4">
                        <div className="font-bold">Available Versions</div>
                        <select
                            className="w-full border rounded px-2 py-1"
                            value={selectedVersion}
                            onChange={e => setSelectedVersion(e.target.value)}
                            disabled={serverStatus.running}
                        >
                            <option value="stable">stable ({availableVersions?.stable?.headless || '...'})</option>
                            <option value="experimental">experimental ({availableVersions?.experimental?.headless || '...'})</option>
                        </select>
                    </div>
                </div>
            }
            actions={
                <div className="md:flex">
                    <Button
                        onClick={installVersion}
                        isLoading={isInstalling}
                        isDisabled={serverStatus.running || isRemoving}
                        size="sm"
                        type="success"
                        className="w-full md:w-auto mb-2 md:mb-0 md:mr-2"
                    >Download & Install</Button>
                    <Button
                        onClick={removeInstallation}
                        isLoading={isRemoving}
                        isDisabled={serverStatus.running || isInstalling}
                        size="sm"
                        type="danger"
                        className="w-full md:w-auto"
                    >Remove Installation</Button>
                </div>
            }
        />
        </form>
    )
};

export default Controls;
