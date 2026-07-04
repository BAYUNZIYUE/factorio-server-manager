import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Panel from '../components/Panel';
import { useInstances } from '../context/InstanceProvider';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faNetworkWired, faSave, faPuzzlePiece, faClock, faPlay, faStop, faRightToBracket, faTrash } from '@fortawesome/free-solid-svg-icons';

const L = {
    title: '实例列表',
    createNew: '+ 创建',
    importSave: '导入存档',
    noInstances: '暂无实例',
    noInstancesDesc: '创建你的第一个 Factorio 服务器实例以开始使用。',
    createFirst: '创建第一个实例',
    version: '版本',
    port: '端口',
    rcon: 'RCON',
    running: '运行中',
    stopped: '已停止',
    starting: '启动中',
    stopping: '停止中',
    start: '启动',
    stop: '停止',
    enter: '进入管理',
    loading: '加载中...',
    saves: '存档',
    mods: '模组',
};

const formatUptime = (seconds) => {
    if (!seconds || seconds <= 0) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

const InstanceList = () => {
    const navigate = useNavigate();
    const { instances, loading, refresh } = useInstances();

    const handleStart = async (name, e) => {
        e.stopPropagation();
        await fetch(`/api/instance/${name}/start`, { method: 'POST' });
        refresh();
    };
    const handleStop = async (name, e) => {
        e.stopPropagation();
        await fetch(`/api/instance/${name}/stop`, { method: 'POST' });
        refresh();
    };
    const handleDelete = async (name, e) => {
        e.stopPropagation();
        if (!window.confirm(`确定删除实例「${name}」？此操作不可撤销。`)) return;
        await fetch(`/api/instances/${name}`, { method: 'DELETE' });
        refresh();
    };
    const statusColor = (s) => {
        switch (s) {
            case 'running': return 'bg-green';
            case 'starting': case 'stopping': return 'bg-yellow';
            case 'error': return 'bg-gray';
            default: return 'bg-red';
        }
    };
    const isRunning = (s) => s === 'running';

    if (loading) return <div className="text-center py-12 text-gray-light">{L.loading}</div>;

    return (
        <div className="space-y-6 px-4 sm:px-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl text-dirty-white font-bold">{L.title}</h1>
                    {instances.length > 0 && (
                        <p className="text-gray-light text-sm mt-1">
                            共 {instances.length} 个实例，{instances.filter(i => isRunning(i.status)).length} 个运行中
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Link to="/instances/create"><Button size="sm" type="success">{L.createNew}</Button></Link>
                    <Link to="/instances/import-save"><Button size="sm" type="default">{L.importSave}</Button></Link>
                </div>
            </div>

            {instances.length === 0 ? (
                <Panel title={L.noInstances} content={
                    <div className="text-center py-12">
                        <FontAwesomeIcon icon={faServer} className="text-5xl text-gray-medium mb-4"/>
                        <p className="text-gray-light mb-4">{L.noInstancesDesc}</p>
                        <Link to="/instances/create"><Button type="success">{L.createFirst}</Button></Link>
                    </div>
                }/>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {instances.map(inst => (
                        <div key={inst.name}
                            className="accentuated rounded-sm bg-gray-dark p-5 cursor-pointer hover:bg-gray-medium hover:scale-[1.01] transition-all duration-150 border border-transparent hover:border-gray-light"
                            onClick={() => navigate(`/instance/${inst.name}`)}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-dirty-white font-bold text-lg truncate">{inst.display_name || inst.name}</h3>
                                    <div className="text-gray-light text-xs">{inst.name}</div>
                                </div>
                                <div className={`${statusColor(inst.status)} rounded-full px-3 py-1 text-xs text-black font-bold whitespace-nowrap ml-3 flex-shrink-0 ${isRunning(inst.status) ? 'animate-pulse' : ''}`}>
                                    {L[inst.status] || inst.status}
                                </div>
                            </div>

                            <div className="text-sm text-gray-light space-y-2 mb-4">
                                <div className="flex items-center gap-2">
                                    <FontAwesomeIcon icon={faServer} className="w-4 text-gray-medium flex-shrink-0"/>
                                    <span>{L.version}: {inst.factorio_version || '\u2014'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <FontAwesomeIcon icon={faNetworkWired} className="w-4 text-gray-medium flex-shrink-0"/>
                                    <span>{L.port}: {inst.game_port} | {L.rcon}: {inst.rcon_port}</span>
                                </div>
                                {(inst.save_count > 0 || inst.mod_count > 0) && (
                                    <div className="flex items-center gap-4">
                                        {inst.save_count > 0 && (
                                            <span className="flex items-center gap-1">
                                                <FontAwesomeIcon icon={faSave} className="w-3 text-gray-medium"/>
                                                {inst.save_count} {L.saves}
                                            </span>
                                        )}
                                        {inst.mod_count > 0 && (
                                            <span className="flex items-center gap-1">
                                                <FontAwesomeIcon icon={faPuzzlePiece} className="w-3 text-gray-medium"/>
                                                {inst.mod_count} {L.mods}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {isRunning(inst.status) && inst.uptime > 0 && (
                                    <div className="flex items-center gap-2 text-green">
                                        <FontAwesomeIcon icon={faClock} className="w-3"/>
                                        <span>运行 {formatUptime(inst.uptime)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-gray-medium">
                                {isRunning(inst.status) ? (
                                    <Button size="sm" type="danger" onClick={(e) => handleStop(inst.name, e)}>
                                        <FontAwesomeIcon icon={faStop} className="mr-1"/>{L.stop}
                                    </Button>
                                ) : (
                                    <Button size="sm" type="success" onClick={(e) => handleStart(inst.name, e)}>
                                        <FontAwesomeIcon icon={faPlay} className="mr-1"/>{L.start}
                                    </Button>
                                )}
                                <Button size="sm" type="primary" onClick={() => navigate(`/instance/${inst.name}`)}>
                                    <FontAwesomeIcon icon={faRightToBracket} className="mr-1"/>{L.enter}
                                </Button>
                                <Button size="sm" type="danger" onClick={(e) => handleDelete(inst.name, e)}>
                                    <FontAwesomeIcon icon={faTrash} className="mr-1"/>{L.delete}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
export default InstanceList;
