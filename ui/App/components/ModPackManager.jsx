import React, { useState, useEffect } from 'react';
import Button from './Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faDownload, faTrash } from '@fortawesome/free-solid-svg-icons';

const ModPackManager = () => {
    const [packs, setPacks] = useState([]);

    const fetchPacks = async () => {
        try {
            const r = await fetch('/api/mods/packs/list');
            if (!r.ok) return;
            const data = await r.json();
            setPacks(data || []);
        } catch (e) {}
    };

    useEffect(() => { fetchPacks(); }, []);

    const handleUpload = () => {
        const name = prompt('模组包名称（与已有名称相同则合并）:');
        if (!name) return;
        fetch('/api/mods/packs/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        }).finally(fetchPacks);
    };

    const handleDelete = async (name) => {
        if (!window.confirm(`删除模组包「${name}」？`)) return;
        await fetch(`/api/mods/packs/${name}/delete`, { method: 'POST' });
        fetchPacks();
    };

    return (
        <div className="py-4 px-2 accentuated">
            <h1 className="text-dirty-white text-lg mb-2 mx-4">MOD 包管理</h1>
            <div className="mx-4">
                <Button className="w-full text-sm" onClick={handleUpload}>
                    <FontAwesomeIcon icon={faUpload} className="mr-1"/>上传 MOD 包
                </Button>
                {packs.length === 0 && (
                    <p className="text-gray-light text-xs text-center py-2">暂无模组包</p>
                )}
                {packs.map(p => (
                    <div key={typeof p === 'string' ? p : p?.name || JSON.stringify(p)} className="flex items-center justify-between text-sm bg-gray-medium rounded-sm px-3 py-1.5 mt-1">
                        <span className="text-dirty-white truncate text-xs">{typeof p === 'string' ? p : p?.name || '?'}</span>
                        <div className="flex gap-1">
                            <a href={`/api/mods/packs/${typeof p === 'string' ? p : p?.name}/download`}
                                className="text-green hover:text-green-light text-xs px-1" title="下载">
                                <FontAwesomeIcon icon={faDownload}/>
                            </a>
                            <button className="text-red hover:text-red-light text-xs px-1" onClick={() => handleDelete(typeof p === 'string' ? p : p?.name)} title="删除">
                                <FontAwesomeIcon icon={faTrash}/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ModPackManager;
// v1783175343
