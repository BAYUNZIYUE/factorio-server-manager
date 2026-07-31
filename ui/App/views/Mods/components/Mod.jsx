import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowCircleUp, faCheck, faSpinner, faTimes,
    faToggleOff, faToggleOn, faTrashAlt, faCaretDown, faCaretRight,
    faUpRightFromSquare, faDownload, faRotate, faEye
} from "@fortawesome/free-solid-svg-icons";
import modsResource from "../../../../api/resources/mods";
import React, {useEffect, useState} from "react";
import {coerce, gt, satisfies} from "semver";

const DLC_MODS = new Set(['elevated-rails', 'quality', 'space-age', 'base']);

const Mod = ({mod, factorioVersion, toggleMod, deleteMod, updateMod, addUpdatableMod, disabled = false, visibleCols, index, allMods, tableMode}) => {
    const isDLC = DLC_MODS.has(mod.name);
    const [newVersion, setNewVersion] = useState(null)
    const [icon, setIcon] = useState(faArrowCircleUp)
    const [checked, setChecked] = useState(false)
    const [safeDepsOpen, setSafeDepsOpen] = useState(false)
    const [repairing, setRepairing] = useState(false)
    const [safeDeps, setSafeDeps] = useState([])

    useEffect(() => {
        try {
            const raw = mod.dependencies;
            if (Array.isArray(raw)) setSafeDeps(raw.filter(d => typeof d === 'string' && d && parseDepName(d) !== 'base'));
            else setSafeDeps([]);
        } catch(e) { setSafeDeps([]); }
    }, [mod]);

    useEffect(() => {
        if (!disabled && !isDLC && !checked) {
            setChecked(true);
            (async () => {
                try {
                    const data = await modsResource.portal.info(mod.name)
                    let newestRelease;
                    (data.releases || []).forEach(release => {
                        if (gt(coerce(release.version), coerce(mod.version)) && (
                            satisfies(factorioVersion, "~" + coerce(release.info_json.factorio_version).version) ||
                            (satisfies(factorioVersion, "1.0.0") && satisfies(coerce(release.info_json.factorio_version), "0.18.x"))
                        )) {
                            if (!newestRelease || gt(coerce(release.version).version, coerce(newestRelease.version).version))
                                newestRelease = release;
                        }
                    });
                    if (newestRelease && newestRelease.version !== mod.version) {
                        const v = {downloadUrl: newestRelease.download_url, fileName: newestRelease.file_name, modName: mod.name};
                        setNewVersion(v);
                        if (addUpdatableMod !== null) addUpdatableMod(v);
                    } else setNewVersion(null);
                } catch (e) {}
            })();
        }
    }, [mod]);

    const vis = visibleCols || ['compatibility','enabled','name','version','factorio'];

    if (tableMode) {
        const isDLC = DLC_MODS.has(mod.name);
        const isDepInstalled = (depName) => Array.isArray(allMods) && allMods.some(m => m.name === depName);
        return (
            <div>
                {mod.title}
                {safeDeps.length > 0 && (
                    <span className="ml-1 text-gray-light cursor-pointer select-none" onClick={() => setSafeDepsOpen(!safeDepsOpen)}>
                        <FontAwesomeIcon icon={safeDepsOpen ? faCaretDown : faCaretRight} className="mr-1 text-xs"/>
                        <span className="text-xs">{safeDeps.length}</span>
                    </span>
                )}
                {safeDepsOpen && safeDeps.length > 0 && (
                    <div className="mt-1 pl-2 border-l-2 border-gray-dark text-xs text-gray-light">
                        {safeDeps.map((d, i) => {
                            const name = parseDepName(d);
                            const inst = isDepInstalled(name);
                            return (<div key={i} className={'whitespace-nowrap py-0.5 ' + (inst ? '' : 'opacity-60')}>{d.trim()}{inst ? <FontAwesomeIcon icon={faEye} className="ml-2 text-blue-400 cursor-pointer hover:text-blue-200" title="定位" onClick={() => { scrollToMod(name); setSafeDepsOpen(false); }}/> : <FontAwesomeIcon icon={faDownload} className="ml-2 text-gray cursor-pointer hover:text-orange" title="下载" onClick={() => window.open('https://mods.factorio.com/mod/' + name, '_blank')}/>}</div>);
                        })}
                    </div>
                )}
            </div>
        );
    }


    const stripVersion = (v) => {
        if (!v) return v;
        const parts = v.split('.');
        if (parts.length === 4 && parts[3] === '0') parts.pop();
        return parts.join('.');
    };

    const parseDepName = (dep) => {
        if (typeof dep !== 'string') return '';
        const parts = dep.split(/\s+/);
        const first = parts[0] || '';
        return first.replace(/^[?!()]+/, '').replace(/[?!()]+$/, '');
    };

    const isDepInstalled = (depName) => Array.isArray(allMods) && allMods.some(m => m.name === depName);

    const scrollToMod = (name) => {
        const el = document.getElementById('mod-row-' + name.replace(/[^a-zA-Z0-9_-]/g, ''));
        if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('mod-flash'); setTimeout(() => el.classList.remove('mod-flash'), 2000); }
    };

    const repairMod = async () => {
        setRepairing(true);
        try {
            const info = await modsResource.portal.info(mod.name);
            const release = info.releases.find(r => r.version === mod.version) || info.releases[info.releases.length - 1];
            if (release) await updateMod({downloadUrl: release.download_url, fileName: release.file_name, modName: mod.name});
        } catch (e) {}
        setRepairing(false);
    };

    const downloadMod = () => window.open('https://mods.factorio.com' + (newVersion?.downloadUrl || '/mod/' + mod.name), '_blank');

    // Data-driven cell rendering — column key → render function
    const renderCell = (colKey) => {
        switch (colKey) {
            case 'compatibility':
                return (
                    <td key="compat" className="pr-4 text-center">
                        {mod.compatibility ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>}
                    </td>
                );
            case 'enabled':
                return (
                    <td key="enabled" className="pr-4 text-center">
                        {isDLC ? (mod.enabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>)
                        : disabled ? (mod.enabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>)
                        : mod.enabled ? <FontAwesomeIcon className="cursor-pointer hover:text-green-light text-green" icon={faToggleOn} onClick={() => toggleMod(mod.name)}/>
                        : <FontAwesomeIcon className="cursor-pointer hover:text-red-light text-red" icon={faToggleOff} onClick={() => toggleMod(mod.name)}/>}
                    </td>
                );
            case 'name':
                return (
                    <td key="name" className="pr-4">
                        {mod.title}
                        {safeDeps.length > 0 && (
                            <span className="ml-1 text-gray-light cursor-pointer select-none" onClick={() => setSafeDepsOpen(!safeDepsOpen)}>
                                <FontAwesomeIcon icon={safeDepsOpen ? faCaretDown : faCaretRight} className="mr-1 text-xs"/>
                                <span className="text-xs">{safeDeps.length}</span>
                            </span>
                        )}
                        {safeDepsOpen && safeDeps.length > 0 && (
                            <div className="mt-1 pl-2 border-l-2 border-gray-dark text-xs text-gray-light">
                                {safeDeps.map((d, i) => {
                                    const name = parseDepName(d);
                                    const inst = isDepInstalled(name);
                                    return (
                                        <div key={i} className={'whitespace-nowrap py-0.5 ' + (inst ? '' : 'opacity-60')}>
                                            {d.trim()}
                                            {inst
                                                ? <FontAwesomeIcon icon={faEye} className="ml-2 text-blue-400 cursor-pointer hover:text-blue-200" title="定位" onClick={() => { scrollToMod(name); setSafeDepsOpen(false); }}/>
                                                : <FontAwesomeIcon icon={faDownload} className="ml-2 text-gray cursor-pointer hover:text-orange" title="下载" onClick={() => window.open('https://mods.factorio.com/mod/' + name, '_blank')}/>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </td>
                );
            case 'version':
                return (
                    <td key="version" className="pr-4">
                        {mod.version}
                        {!disabled && newVersion && <FontAwesomeIcon spin={icon === faSpinner} onClick={() => { setIcon(faSpinner); updateMod(newVersion).finally(() => setIcon(faArrowCircleUp)); }} className="hover:text-orange cursor-pointer ml-1" icon={icon}/>}
                    </td>
                );
            case 'factorio':
                return (
                    <td key="factorio" className="pr-4">
            <td className="pr-4">{'≥ ' + stripVersion(mod.factorio_version)}</td>
                    </td>
                );
            case 'size':
                return (
                    <td key="size" className="pr-4 text-gray-light text-sm">
                        {mod.file_size > 0 ? ((mod.file_size / 1024).toFixed(0) + ' KB') : '-'}
                    </td>
                );
            default:
                return null;
        }
    };

    return (
        <tr className="py-1 border-b border-gray-dark" id={'mod-row-' + (mod.name || '').replace(/[^a-zA-Z0-9_-]/g, '')}>
            <td className="text-gray-light text-xs" style={{width: 40, height: 40, textAlign: 'center', verticalAlign: 'middle'}}>{index}</td>
            {vis.map(key => renderCell(key))}
            {!isDLC && !disabled && (
            <td className="pr-2 text-center" style={{width: 100}}>
                <FontAwesomeIcon icon={faUpRightFromSquare} className="text-gray-light cursor-pointer hover:text-white mx-1" title="模组门户" onClick={() => window.open('https://mods.factorio.com/mod/' + mod.name, '_blank')}/>
                <FontAwesomeIcon icon={faDownload} className="text-gray-light cursor-pointer hover:text-white mx-1" title="下载模组" onClick={downloadMod}/>
                <FontAwesomeIcon icon={faRotate} spin={repairing} className={repairing ? 'text-orange cursor-pointer mx-1' : 'text-gray-light cursor-pointer hover:text-orange mx-1'} title="修复模组" onClick={repairMod}/>
                <FontAwesomeIcon icon={faTrashAlt} className="text-red cursor-pointer hover:text-red-light mx-1" title="删除模组" onClick={() => deleteMod(mod.name)}/>
            </td>)}
        </tr>
    )
}

export default Mod;
