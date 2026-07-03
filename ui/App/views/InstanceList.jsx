import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Panel from '../components/Panel';
import { useInstances } from '../context/InstanceProvider';

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

    if (loading) return <div className="text-center py-8 text-gray-light">Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl text-dirty-white font-bold">Instances</h1>
                <div className="flex gap-2">
                    <Link to="/instances/create"><Button size="sm" type="success">+ Create</Button></Link>
                    <Link to="/instances/import-save"><Button size="sm" type="default">Import Save</Button></Link>
                </div>
            </div>
            {instances.length === 0 ? (
                <Panel title="No Instances" content={
                    <div className="text-center py-8">
                        <p className="text-gray-light mb-4">Create your first Factorio server instance.</p>
                        <Link to="/instances/create"><Button type="success">Create First Instance</Button></Link>
                    </div>
                }/>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map(inst => (
                        <div key={inst.name} className="accentuated rounded-sm bg-gray-dark p-4 cursor-pointer hover:bg-gray-medium transition-colors"
                            onClick={() => navigate(`/instance/${inst.name}`)}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-dirty-white font-bold text-lg">{inst.display_name || inst.name}</h3>
                                    <div className="text-gray-light text-xs">{inst.name}</div>
                                </div>
                                <div className={`${statusColor(inst.status)} rounded-full px-3 py-1 text-xs text-black font-bold`}>
                                    {inst.status}
                                </div>
                            </div>
                            <div className="text-sm text-gray-light space-y-1">
                                <div>Version: {inst.factorio_version || '\u2014'}</div>
                                <div>Port: {inst.game_port}</div>
                                <div>RCON: {inst.rcon_port}</div>
                            </div>
                            <div className="flex gap-2 mt-3">
                                {inst.status === 'running' ? (
                                    <Button size="sm" type="danger" onClick={(e) => handleStop(inst.name, e)}>Stop</Button>
                                ) : (
                                    <Button size="sm" type="success" onClick={(e) => handleStart(inst.name, e)}>Start</Button>
                                )}
                                <Button size="sm" type="default" onClick={() => navigate(`/instance/${inst.name}`)}>Enter</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
export default InstanceList;
