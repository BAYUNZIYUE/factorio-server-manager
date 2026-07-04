import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '../components/Panel';
import Button from '../components/Button';
import Error from '../components/Error';
import { useForm } from 'react-hook-form';

const InstanceCreate = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [modpacks, setModpacks] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedModpack, setSelectedModpack] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [selectedSave, setSelectedSave] = useState('');
    const [globalSaves, setGlobalSaves] = useState([]);
    const { handleSubmit, register, formState: { errors }, watch, setValue } = useForm();

    useEffect(() => {
        fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d || [])).catch(() => {});
        fetch('/api/saves/pool').then(r => r.json()).then(d => setGlobalSaves(d || [])).catch(() => {});
    }, []);

    const onTemplateChange = (name) => {
        setSelectedTemplate(name);
        if (!name) return;
        const t = templates.find(t => t.name === name);
        if (t) {
            if (t.game_port) setValue('game_port', t.game_port);
            if (t.modpack) {
                setSelectedModpack(t.modpack);
            }
        }
    };

    const onSubmit = async (data) => {
        setCreating(true);
        setError('');
        try {
            const body = {
                name: data.name,
                display_name: data.display_name || data.name,
                game_port: parseInt(data.game_port) || 34197,
            };
            if (selectedModpack) body.modpack = selectedModpack;
            if (selectedSave) body.save = selectedSave;
            const res = await fetch('/api/instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const result = await res.json();
                navigate(`/instance/${result.name}`);
            } else {
                setError(await res.text());
            }
        } catch (e) {
            setError(e.message);
        }
        setCreating(false);
    };

    const formValues = watch();

    return (
        <div className="space-y-6 px-4 sm:px-6 max-w-xl mx-auto">
            <h1 className="text-2xl text-dirty-white font-bold">创建实例</h1>
            {step === 1 && (
                <Panel title="1. 配置" content={
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-light">名称 *</label>
                            <input {...register('name', { required: true, pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, minLength: 1, maxLength: 64 })}
                                className="w-full bg-black border border-gray-medium text-dirty-white rounded-sm px-3 py-2 mt-1 text-sm"/>
                            {errors.name && <Error message="小写字母数字加连字符，1-64 字符"/>}
                        </div>
                        <div>
                            <label className="text-sm text-gray-light">显示名称</label>
                            <input {...register('display_name')}
                                className="w-full bg-black border border-gray-medium text-dirty-white rounded-sm px-3 py-2 mt-1 text-sm"/>
                        </div>
                        <div>
                            <label className="text-sm text-gray-light">游戏端口</label>
                            <input type="number" defaultValue={34197}
                                {...register('game_port', { min: 1024, max: 65535 })}
                                className="w-full bg-black border border-gray-medium text-dirty-white rounded-sm px-3 py-2 mt-1 text-sm"/>
                            {errors.game_port && <Error message="端口范围 1024-65535"/>}
                        </div>
                        <div>
                            <label className="text-sm text-gray-light">从模板创建（可选）</label>
                            <select value={selectedTemplate} onChange={e => onTemplateChange(e.target.value)}
                                className="w-full bg-black border border-gray-medium text-dirty-white rounded-sm px-3 py-2 mt-1 text-sm">
                                <option value="">自定义配置</option>
                                {templates.map(t => (
                                    <option key={t.name} value={t.name}>{t.name}{t.factorio_version ? ` (${t.factorio_version})` : ''}{t.modpack ? ` + ${t.modpack}` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-gray-light">初始存档（可选，从全局池复制）</label>
                            <select value={selectedSave} onChange={e => setSelectedSave(e.target.value)}
                                className="w-full bg-black border border-gray-medium text-dirty-white rounded-sm px-3 py-2 mt-1 text-sm">
                                <option value="">无（空服务器）</option>
                                {globalSaves.map(s => (
                                    <option key={s.name} value={s.name}>{s.name} ({(s.size/1024).toFixed(0)} KB)</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-gray-light">模组包（可选）</label>
                            <select value={selectedModpack} onChange={e => setSelectedModpack(e.target.value)}
                                className="w-full bg-black border border-gray-medium text-dirty-white rounded-sm px-3 py-2 mt-1 text-sm">
                                <option value="">无（手动配置模组）</option>
                                {modpacks.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button type="default" onClick={() => navigate('/instances')}>取消</Button>
                            <Button type="primary" onClick={() => setStep(2)}>下一步</Button>
                        </div>
                    </div>
                }/>
            )}
            {step === 2 && (
                <Panel title="2. 确认" content={
                    <div className="space-y-4">
                        <div className="bg-gray-dark rounded-sm p-3 space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-light">名称</span><span className="text-dirty-white">{formValues.name}</span></div>
                            {formValues.display_name && <div className="flex justify-between"><span className="text-gray-light">显示名称</span><span className="text-dirty-white">{formValues.display_name}</span></div>}
                            <div className="flex justify-between"><span className="text-gray-light">端口</span><span className="text-dirty-white">{formValues.game_port || 34197}</span></div>
                            <div className="flex justify-between"><span className="text-gray-light">模组包</span><span className="text-dirty-white">{selectedModpack || '无（手动配置）'}</span></div>
                        </div>
                        {error && <Error message={error}/>}
                        <div className="flex gap-2 pt-2">
                            <Button type="default" onClick={() => setStep(1)}>返回</Button>
                            <Button type="success" isLoading={creating} onClick={handleSubmit(onSubmit)}>创建实例</Button>
                        </div>
                    </div>
                }/>
            )}
        </div>
    );
};
export default InstanceCreate;
