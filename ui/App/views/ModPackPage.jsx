import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import Panel from '../components/Panel';

const ModPackPage = () => {
    const [packs, setPacks] = useState([]);
    const [selected, setSelected] = useState(null);
    const [mods, setMods] = useState([]);
    const [portalInfo, setPortalInfo] = useState({});
    const [checking, setChecking] = useState(false);
    const [updating, setUpdating] = useState({});

    const fetchPacks = async () => {
        try { const r = await fetch('/api/mods/packs/list'); setPacks(await r.json() || []); } catch(e) {}
    };
    useEffect(() => { fetchPacks(); }, []);

    const selectPack = async (name) => {
        setSelected(name);
        try { const r = await fetch(`/api/mods/packs/${name}/list`); setMods(await r.json() || []); } catch(e) {}
    };

    const checkUpdates = async () => {
        if (!selected || !mods.length) return;
        setChecking(true);
        const info = {};
        for (const m of mods) {
            if (m.name === 'base') continue;
            try {
                const r = await fetch(`/api/mods/portal/info/${m.name}`);
                const d = await r.json();
                if (d?.releases?.length) {
                    const latest = d.releases[0];
                    const currentVer = m.version || m.enabled?.version || '';
                    info[m.name] = {
                        latest: latest.version,
                        current: currentVer,
                        hasUpdate: latest.version !== currentVer && currentVer !== '',
                        downloadUrl: latest.download_url,
                        fileName: latest.file_name,
                    };
                }
            } catch(e) {}
        }
        setPortalInfo(info);
        setChecking(false);
    };

    const updateMod = async (modName) => {
        setUpdating(p => ({...p, [modName]: true}));
        const info = portalInfo[modName];
        try {
            await fetch(`/api/mods/packs/${selected}/mod/update`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ modName, downloadUrl: info.downloadUrl, fileName: info.fileName })
            });
            // Refresh mod list
            await selectPack(selected);
        } catch(e) {}
        setUpdating(p => ({...p, [modName]: false}));
    };

    const handleDelete = async (name) => {
        if (!window.confirm(`删除模组包「${name}」？`)) return;
        await fetch(`/api/mods/packs/${name}/delete`, { method: 'POST' });
        setSelected(null); setMods([]);
        fetchPacks();
    };

    const handleCreate = async () => {
        const name = prompt('模组包名称:');
        if (!name) return;
        await fetch('/api/mods/packs/create', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name}) });
        fetchPacks();
    };

    const updateCount = Object.values(portalInfo).filter(i => i.hasUpdate).length;

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl text-dirty-white font-bold">MOD 包管理</h1>
                <div className="flex gap-2">
                    <Link to="/instances"><Button size="sm" type="default">← 实例列表</Button></Link>
                    <Button size="sm" type="success" onClick={handleCreate}>+ 创建模组包</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Left: Pack list */}
                <div className="md:col-span-1">
                    <Panel title="模组包列表" content={
                        <div className="space-y-1">
                            {packs.length === 0 && <p className="text-gray-light text-sm text-center py-4">暂无模组包</p>}
                            {packs.map(p => (
                                <div key={p} className={`flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer text-sm ${selected === p ? 'bg-gray-medium text-dirty-white' : 'bg-gray-dark text-gray-light hover:bg-gray-medium'}`}
                                    onClick={() => selectPack(p)}>
                                    <span className="truncate">{p}</span>
                                    <div className="flex gap-1 ml-2 flex-shrink-0">
                                        <a href={`/api/mods/packs/${p}/download`} className="text-green hover:text-green-light text-xs px-1" title="下载">↓</a>
                                        <button className="text-red hover:text-red-light text-xs px-1" onClick={(e) => { e.stopPropagation(); handleDelete(p); }} title="删除">✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    }/>
                </div>

                {/* Right: Mod list */}
                <div className="md:col-span-2">
                    {!selected ? (
                        <div className="text-center py-16 text-gray-light">
                            <p className="text-lg mb-2">选择一个模组包查看详情</p>
                            <p className="text-sm">左侧列表中选择一个模组包，查看和更新其中的模组</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg text-dirty-white font-bold">{selected}</h2>
                                <div className="flex gap-2">
                                    <Button size="sm" type="default" isLoading={checking} onClick={checkUpdates}>
                                        {updateCount > 0 ? `${updateCount} 个可更新` : '检查更新'}
                                    </Button>
                                </div>
                            </div>
                            {mods.length === 0 ? (
                                <p className="text-gray-light text-sm text-center py-8">该模组包为空</p>
                            ) : (
                                <div className="space-y-1">
                                    {mods.map(m => {
                                        const info = portalInfo[m.name];
                                        const isUpdating = updating[m.name];
                                        return (
                                            <div key={m.name} className="flex items-center justify-between bg-gray-dark rounded-sm px-4 py-2.5 text-sm">
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-dirty-white">{m.name}</span>
                                                    <span className="text-gray-light ml-2 text-xs">
                                                        {m.version || m.enabled?.version || '?'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    {info?.hasUpdate && (
                                                        <span className="text-yellow text-xs">
                                                            更新: {info.current} → {info.latest}
                                                        </span>
                                                    )}
                                                    {info?.hasUpdate ? (
                                                        <Button size="sm" type="success" isLoading={isUpdating}
                                                            onClick={() => updateMod(m.name)}>
                                                            更新
                                                        </Button>
                                                    ) : info ? (
                                                        <span className="text-green text-xs">已最新</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModPackPage;
