import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Panel from '../components/Panel';
import { useInstances } from '../context/InstanceProvider';

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
    const statusColor = (s) => {
        switch (s) {
            case 'running': return 'bg-green';
            case 'starting': case 'stopping': return 'bg-yellow';
            case 'error': return 'bg-gray';
            default: return 'bg-red';
        }
    };

    if (loading) return <div className="text-center py-8 text-gray-light">{L.loading}</div>;

    return (
        <div className="space-y-6 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h1 className="text-2xl text-dirty-white font-bold">{L.title}</h1>
                <div className="flex gap-2">
                    <Link to="/instances/create"><Button size="sm" type="success">{L.createNew}</Button></Link>
                    <Link to="/instances/import-save"><Button size="sm" type="default">{L.importSave}</Button></Link>
                </div>
            </div>
            {instances.length === 0 ? (
                <Panel title={L.noInstances} content={
                    <div className="text-center py-8">
                        <p className="text-gray-light mb-4">{L.noInstancesDesc}</p>
                        <Link to="/instances/create"><Button type="success">{L.createFirst}</Button></Link>
                    </div>
                }/>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map(inst => (
                        <div key={inst.name} className="accentuated rounded-sm bg-gray-dark p-4 cursor-pointer hover:bg-gray-medium transition-colors"
                            onClick={() => navigate(`/instance/${inst.name}`)}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-dirty-white font-bold text-lg">{inst.display_name || inst.name}</h3>
                                    <div className="text-gray-light text-xs">{inst.name}</div>
                                </div>
                                <div className={`${statusColor(inst.status)} rounded-full px-3 py-1 text-xs text-black font-bold`}>
                                    {L[inst.status] || inst.status}
                                </div>
                            </div>
                            <div className="text-sm text-gray-light space-y-1">
                                <div>{L.version}: {inst.factorio_version || '\u2014'}</div>
                                <div>{L.port}: {inst.game_port}</div>
                                <div>{L.rcon}: {inst.rcon_port}</div>
                            </div>
                            <div className="flex gap-2 mt-3">
                                {inst.status === 'running' ? (
                                    <Button size="sm" type="danger" onClick={(e) => handleStop(inst.name, e)}>{L.stop}</Button>
                                ) : (
                                    <Button size="sm" type="success" onClick={(e) => handleStart(inst.name, e)}>{L.start}</Button>
                                )}
                                <Button size="sm" type="primary" onClick={() => navigate(`/instance/${inst.name}`)}>{L.enter}</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
export default InstanceList;
