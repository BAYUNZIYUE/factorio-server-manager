import React, {useEffect, useState, useRef} from "react";
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Panel from "../components/Panel";
import Button from "../components/Button";
import server from "../../api/resources/server";
import savesResource from "../../api/resources/saves";
import modsResource from "../../api/resources/mods";
import {useForm} from "react-hook-form";
import Select from "../components/Select";
import Input from "../components/Input";
import Error from "../components/Error";
import socket from "../../api/socket";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faUsers, faClock, faMicrochip, faMemory, faComments} from "@fortawesome/free-solid-svg-icons";
import { useInstance } from '../context/InstanceProvider';

const Controls = () => {
    const navigate = useNavigate();
    const { name } = useParams();
    const { instanceStatus } = useInstance();
    const serverStatus = instanceStatus || {};

    const { t } = useTranslation('controls');
    const savedIp = localStorage.getItem('fsm_ip') || '0.0.0.0';
    const savedPort = localStorage.getItem('fsm_port') || '34197';
    const factorioVersion = serverStatus.fac_version ? serverStatus.fac_version : t('UNKNOWN');
    const [saves, setSaves] = useState([]);
    const [isDisabled, setIsDisabled] = useState(true);
    const [isStopping, setIsStopping] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isKilling, setIsKilling] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [modStats, setModStats] = useState({total: 0, compat: 0, incompat: 0});
    const [uptime, setUptime] = useState(0);
    const [players, setPlayers] = useState([]);
    const chatEnd = useRef(null);

    const { handleSubmit, reset, register, formState: {errors} } = useForm();

    const startServer = async (data) => {
        setIsStarting(true);
        localStorage.setItem('fsm_ip', data.ip);
        localStorage.setItem('fsm_port', data.port);
        await server.instanceStart(name, data.ip, parseInt(data.port), data.save);
    }

    const stopServer = async () => {
        setIsStopping(true);
        await server.instanceStop(name);
    }

    const killServer = async () => {
        setIsKilling(true);
        await server.instanceKill(name);
    }

    useEffect(() => {
        savesResource.list(true)
            .then(res => {
                setSaves(res);
                if (res.length > 0) setIsDisabled(undefined);
                reset();
            });
        modsResource.installed().then(mods => {
            setModStats({
                total: mods.length,
                compat: mods.filter(m => m.compatibility).length,
                incompat: mods.filter(m => !m.compatibility).length
            });
        });
    }, []);

    useEffect(() => {
        const handler = (msg) => {
            const text = String(msg);
            if (text.includes('[CHAT]')) {
                setChatMessages(prev => [...prev.slice(-49), text.replace(/^.*\[CHAT\]\s*/, '')]);
            }
            if (text.includes('joined the game')) {
                const name = text.match(/\[JOIN\]\s*(\S+)/)?.[1] || '';
                if (name) setPlayers(prev => prev.includes(name) ? prev : [...prev, name]);
            }
            if (text.includes('left the game')) {
                const name = text.match(/\[LEAVE\]\s*(\S+)/)?.[1] || '';
                if (name) setPlayers(prev => prev.filter(p => p !== name));
            }
        };
        socket.on('gamelog', handler);
        return () => socket.off('gamelog', handler);
    }, []);

    useEffect(() => {
        if (!serverStatus.running) return;
        setUptime(0);
        const timer = setInterval(() => setUptime(u => u + 1), 1000);
        return () => clearInterval(timer);
    }, [serverStatus.running]);

    useEffect(() => { chatEnd.current?.scrollIntoView({behavior:'smooth'}); }, [chatMessages]);

    const fmtTime = (s) => {
        const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sec = s%60;
        return `${h}h ${m}m ${sec}s`;
    };

    return (
        <div className="space-y-6">
            {/* Status Banner */}
            {serverStatus.running ? (
                <div className="rounded-sm bg-green-dark p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green animate-pulse"/>
                        <span className="text-white font-bold text-lg">{t('RUNNING')}</span>
                        <span className="text-gray-light text-sm">{fmtTime(uptime)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-gray-light text-sm">
                        <span><FontAwesomeIcon icon={faUsers} className="mr-1"/>{players.length} {t('players') || 'players'}</span>
                        <span>{serverStatus.bindip}:{serverStatus.port}</span>
                    </div>
                </div>
            ) : (
                <div className="rounded-sm bg-gray-dark p-4 flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-gray"/>
                    <span className="text-gray-light font-bold text-lg">{t('STOPPED')}</span>
                </div>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="accentuated rounded-sm bg-gray-dark p-4 text-center">
                    <FontAwesomeIcon icon={faMicrochip} className="text-gray-light text-2xl mb-1"/>
                    <div className="text-dirty-white font-bold">{factorioVersion}</div>
                    <div className="text-gray-light text-xs">{t('factorioVersion')}</div>
                </div>
                <div className="accentuated rounded-sm bg-gray-dark p-4 text-center">
                    <FontAwesomeIcon icon={faUsers} className="text-gray-light text-2xl mb-1"/>
                    <div className="text-dirty-white font-bold">{players.length}</div>
                    <div className="text-gray-light text-xs">{t('players') || 'players'}</div>
                </div>
                <div className="accentuated rounded-sm bg-gray-dark p-4 text-center">
                    <FontAwesomeIcon icon={faClock} className="text-gray-light text-2xl mb-1"/>
                    <div className="text-dirty-white font-bold">{serverStatus.running ? fmtTime(uptime) : '--'}</div>
                    <div className="text-gray-light text-xs">{t('uptime') || 'uptime'}</div>
                </div>
                <div className="accentuated rounded-sm bg-gray-dark p-4 text-center">
                    <div className="text-dirty-white font-bold text-lg">{modStats.total}</div>
                    <div className="text-green text-xs">{modStats.compat} {t('compatible') || 'compatible'}</div>
                    <div className="text-red text-xs">{modStats.incompat} {t('incompatible') || 'incompatible'}</div>
                </div>
            </div>

            {/* Players List */}
            {serverStatus.running && players.length > 0 && (
                <Panel title={t('players') || 'Online Players'} content={
                    <div className="flex flex-wrap gap-2">
                        {players.map(p => (
                            <span key={p} className="bg-gray-medium text-dirty-white px-3 py-1 rounded-full text-sm">{p}</span>
                        ))}
                    </div>
                }/>
            )}

            {/* Server Controls */}
            <form onSubmit={handleSubmit(startServer)}>
                <Panel
                    title={t('serverStatus')}
                    content={
                        serverStatus.running ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div><span className="text-gray-light">{t('ip')}:</span> <span className="text-dirty-white">{serverStatus.bindip}</span></div>
                                <div><span className="text-gray-light">{t('port')}:</span> <span className="text-dirty-white">{serverStatus.port}</span></div>
                                <div><span className="text-gray-light">{t('factorioVersion')}:</span> <span className="text-dirty-white">{factorioVersion}</span></div>
                                <div><span className="text-gray-light">{t('save')}:</span> <span className="text-dirty-white">{serverStatus.savefile}</span></div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <div className="font-bold text-sm mb-1">{t('ip')}</div>
                                    <Input defaultValue={savedIp} disabled={isDisabled}
                                        register={register('ip',{required: true, pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/})}/>
                                    <Error error={errors.ip} message={t('ipRequired')}/>
                                </div>
                                <div>
                                    <div className="font-bold text-sm mb-1">{t('port')}</div>
                                    <Input type="number" min={1} max={65535} defaultValue={savedPort} disabled={isDisabled}
                                        register={register('port',{required: true, min: 1, max: 65535})}/>
                                    <Error error={errors.port} message={t('portRequired')}/>
                                </div>
                                <div>
                                    <div className="font-bold text-sm mb-1">{t('factorioVersion')}</div>
                                    <div className="py-2 text-dirty-white">{factorioVersion}</div>
                                </div>
                                <div>
                                    <div className="font-bold text-sm mb-1">{t('save')}</div>
                                    <Select register={register('save',{required: true})}
                                        defaultValue={saves.find((s) => s.name.startsWith('Load Latest'))?.name}
                                        disabled={isDisabled}
                                        options={saves.map(s => ({value: s.name, name: s.name}))}/>
                                    <Error error={errors.save} message={t('saveRequired')}/>
                                </div>
                            </div>
                        )
                    }
                    actions={
                        <div className="md:flex gap-2">
                            {serverStatus.running ? (
                                <>
                                    <Button onClick={stopServer} isLoading={isStopping} isDisabled={isKilling} size="sm" type="default">{t('saveStopServer')}</Button>
                                    <Button onClick={killServer} isLoading={isKilling} isDisabled={isStopping} size="sm" type="danger">{t('killServer')}</Button>
                                </>
                            ) : (
                                <Button isSubmit={true} isDisabled={isDisabled} isLoading={isStarting} size="sm" type="success">{t('startServer')}</Button>
                            )}
                        </div>
                    }
                />
            </form>

            <div className="mt-3 flex gap-2">
                <Button onClick={() => navigate('/instances')} size="sm" type="danger">
                    ← 返回实例列表
                </Button>
                <Button onClick={async () => {
                    const templateName = prompt('模板名称（默认使用实例名）:');
                    if (templateName !== null) {
                        await fetch(`/api/templates/from/${name}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ template_name: templateName || undefined })
                        });
                        alert(templateName || name + ' 模板已保存');
                    }
                }} size="sm" type="default">💾 保存为模板</Button>
            </div>

            {/* Chat Panel */}
            {serverStatus.running && (
                <Panel title={<span><FontAwesomeIcon icon={faComments} className="mr-2"/>{t('chat') || 'Chat'}</span>} content={
                    <div className="bg-black rounded-sm p-2 max-h-48 overflow-y-auto font-mono text-xs text-green-light">
                        {chatMessages.length === 0 && <div className="text-gray text-center py-4">{t('noChatYet') || 'No chat messages yet'}</div>}
                        {chatMessages.map((msg, i) => (
                            <div key={i} className="py-0.5 border-b border-gray-dark last:border-0">{msg}</div>
                        ))}
                        <div ref={chatEnd}/>
                    </div>
                }/>
            )}
        </div>
    );
};

export default Controls;
