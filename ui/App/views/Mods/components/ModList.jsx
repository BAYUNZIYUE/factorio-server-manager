import Mod from "./Mod";
import React, {useState, useMemo, useCallback, useRef, useEffect} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faTimes, faToggleOff, faToggleOn, faSort, faSortUp, faSortDown, faCog} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from 'react-i18next';

const DLC_MODS = new Set(['elevated-rails', 'quality', 'space-age']);

const COLUMNS = [
    { key: 'compatibility', label: 'Compatibility', default: true, sortable: true, sortKey: 'compatibility', width: 80 },
    { key: 'enabled',       label: 'Enabled',       default: true, sortable: true, sortKey: 'enabled',       width: 70 },
    { key: 'name',          label: 'Name',          default: true, sortable: true, sortKey: 'title',         width: 0 },
    { key: 'version',       label: 'Mod Version',   default: true, sortable: true, sortKey: 'version',       width: 100 },
    { key: 'factorio',      label: 'Factorio Version', default: true, sortable: false,                       width: 140 },
    { key: 'size',          label: 'File Size',     default: false, sortable: true, sortKey: 'file_size',    width: 80 },
];

const loadWidths = () => {
    try { return JSON.parse(localStorage.getItem('modlist_widths') || '{}'); } catch { return {}; }
};
const saveWidths = (w) => localStorage.setItem('modlist_widths', JSON.stringify(w));

const ModList = ({mods, factorioVersion, updateMod, toggleMod, deleteMod, addUpdatableMod = null, disabled = false}) => {

    const { t } = useTranslation('mods');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [colWidths, setColWidths] = useState(loadWidths);
    const [visibleCols, setVisibleCols] = useState(() => {
        const saved = localStorage.getItem('modlist_cols');
        if (saved) { try { return JSON.parse(saved); } catch {} }
        return COLUMNS.filter(c => c.default).map(c => c.key);
    });
    const [showSettings, setShowSettings] = useState(false);
    const [resizing, setResizing] = useState(null);

    const dlcMods = mods.filter(m => DLC_MODS.has(m.name));
    const regularMods = mods.filter(m => !DLC_MODS.has(m.name));
    const dlcEnabled = dlcMods.some(m => m.enabled);

    const sortedMods = useMemo(() => {
        if (!sortCol) return regularMods;
        const col = COLUMNS.find(c => c.key === sortCol);
        if (!col || !col.sortKey) return regularMods;
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...regularMods].sort((a, b) => {
            let va = a[col.sortKey], vb = b[col.sortKey];
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va == null) return 1;
            if (vb == null) return -1;
            return va < vb ? -dir : va > vb ? dir : 0;
        });
    }, [regularMods, sortCol, sortDir]);

    const handleSort = (colKey) => {
        if (sortCol === colKey) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
        else { setSortCol(colKey); setSortDir('asc'); }
    };

    const toggleCol = (key) => {
        setVisibleCols(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            localStorage.setItem('modlist_cols', JSON.stringify(next));
            return next;
        });
    };

    const onResizeStart = useCallback((e, colKey) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = colWidths[colKey] || COLUMNS.find(c => c.key === colKey)?.width || 100;
        setResizing({ colKey, startX, startWidth });
    }, [colWidths]);

    useEffect(() => {
        if (!resizing) return;
        const onMove = (e) => {
            const diff = e.clientX - resizing.startX;
            const newWidth = Math.max(40, resizing.startWidth + diff);
            setColWidths(prev => ({ ...prev, [resizing.colKey]: newWidth }));
        };
        const onUp = () => {
            setColWidths(prev => { saveWidths(prev); return prev; });
            setResizing(null);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [resizing]);

    const toggleDLC = () => {
        dlcMods.forEach(m => {
            if (dlcEnabled === m.enabled) toggleMod(m.name);
        });
    };

    const SortIcon = ({colKey}) => {
        if (sortCol !== colKey) return <FontAwesomeIcon icon={faSort} className="ml-1 text-gray opacity-40"/>;
        return <FontAwesomeIcon icon={sortDir === 'asc' ? faSortUp : faSortDown} className="ml-1"/>;
    };

    const getWidth = (col) => colWidths[col.key] || col.width || undefined;
    const vis = (key) => visibleCols.includes(key);

    return (
        <div>
            <div className="flex justify-end mb-1 relative">
                <button className="text-xs text-gray-light hover:text-white px-2 py-0.5 rounded"
                        onClick={() => setShowSettings(!showSettings)}>
                    <FontAwesomeIcon icon={faCog} className="mr-1"/>{t('columns')}
                </button>
                {showSettings && (
                    <div className="absolute right-0 top-6 bg-gray-dark border border-gray-medium rounded-sm p-2 z-10 shadow-xl text-xs">
                        {COLUMNS.map(c => (
                            <label key={c.key} className="flex items-center gap-1 py-0.5 cursor-pointer text-gray-light hover:text-white">
                                <input type="checkbox" checked={vis(c.key)} onChange={() => toggleCol(c.key)} className="mr-1"/>
                                {t(c.label)}
                            </label>
                        ))}
                    </div>
                )}
            </div>
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                    {vis('compatibility') && <col style={{ width: getWidth(COLUMNS[0]) }}/>}
                    {vis('enabled') && <col style={{ width: getWidth(COLUMNS[1]) }}/>}
                    {vis('name') && <col/>}
                    {vis('version') && <col style={{ width: getWidth(COLUMNS[3]) }}/>}
                    {vis('factorio') && <col style={{ width: getWidth(COLUMNS[4]) }}/>}
                    {vis('size') && <col style={{ width: getWidth(COLUMNS[5]) }}/>}
                    <col style={{ width: 30 }}/>
                </colgroup>
                <thead>
                    <tr className="text-left border-b-2 border-gray">
                        {vis('compatibility') && (
                            <th className="cursor-pointer select-none px-2 relative border-r border-gray" onClick={() => handleSort('compatibility')}>
                                {t('Compatibility')}<SortIcon colKey="compatibility"/>
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400"
                                     onMouseDown={(e) => onResizeStart(e, 'compatibility')}/>
                            </th>
                        )}
                        {vis('enabled') && (
                            <th className="cursor-pointer select-none px-2 relative border-r border-gray" onClick={() => handleSort('enabled')}>
                                {t('Enabled')}<SortIcon colKey="enabled"/>
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400"
                                     onMouseDown={(e) => onResizeStart(e, 'enabled')}/>
                            </th>
                        )}
                        {vis('name') && (
                            <th className="cursor-pointer select-none px-2 relative border-r border-gray" onClick={() => handleSort('name')}>
                                {t('Name')}<SortIcon colKey="name"/>
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400"
                                     onMouseDown={(e) => onResizeStart(e, 'name')}/>
                            </th>
                        )}
                        {vis('version') && (
                            <th className="cursor-pointer select-none px-2 relative border-r border-gray" onClick={() => handleSort('version')}>
                                {t('Mod Version')}<SortIcon colKey="version"/>
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400"
                                     onMouseDown={(e) => onResizeStart(e, 'version')}/>
                            </th>
                        )}
                        {vis('factorio') && (
                            <th className="px-2 relative border-r border-gray">
                                {t('Factorio Version')}
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400"
                                     onMouseDown={(e) => onResizeStart(e, 'factorio')}/>
                            </th>
                        )}
                        {vis('size') && (
                            <th className="cursor-pointer select-none px-2 relative border-r border-gray" onClick={() => handleSort('size')}>
                                {t('File Size')}<SortIcon colKey="size"/>
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400"
                                     onMouseDown={(e) => onResizeStart(e, 'size')}/>
                            </th>
                        )}
                        <th style={{width: 30}}/>
                    </tr>
                </thead>
                <tbody>
                    {factorioVersion !== null && dlcMods.length > 0 && (
                        <tr className="border-b border-gray-dark bg-blue-50 hover:bg-blue-100">
                            {vis('compatibility') && <td className="px-2"><FontAwesomeIcon className="text-green" icon={faCheck}/></td>}
                            {vis('enabled') && <td className="px-2">
                                {disabled
                                    ? dlcEnabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>
                                    : dlcEnabled
                                        ? <FontAwesomeIcon className="cursor-pointer hover:text-green-light text-green" icon={faToggleOn} onClick={toggleDLC}/>
                                        : <FontAwesomeIcon className="cursor-pointer hover:text-red-light text-red" icon={faToggleOff} onClick={toggleDLC}/>
                                }
                            </td>}
                            {vis('name') && <td className="px-2 italic text-blue-600">{t('Space Age DLC')}</td>}
                            {vis('version') && <td className="px-2">{dlcMods[0]?.version}</td>}
                            {vis('factorio') && <td className="px-2">{dlcMods[0]?.factorio_version}</td>}
                            {vis('size') && <td className="px-2 text-gray-light text-sm">-</td>}
                            <td/>
                        </tr>
                    )}
                    {factorioVersion !== null && sortedMods.map(mod => (
                        <Mod mod={mod} key={mod.name}
                             updateMod={updateMod} toggleMod={toggleMod} deleteMod={deleteMod}
                             addUpdatableMod={addUpdatableMod} factorioVersion={factorioVersion}
                             disabled={disabled} visibleCols={visibleCols} />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ModList;
