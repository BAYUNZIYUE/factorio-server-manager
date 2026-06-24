import Mod from "./Mod";
import React, {useState, useMemo} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faTimes, faToggleOff, faToggleOn, faSort, faSortUp, faSortDown, faCog} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from 'react-i18next';

const DLC_MODS = new Set(['elevated-rails', 'quality', 'space-age']);

const COLUMNS = [
    { key: 'compatibility', label: 'Compatibility', default: true, sortable: true, sortKey: 'compatibility' },
    { key: 'enabled',       label: 'Enabled',       default: true, sortable: true, sortKey: 'enabled' },
    { key: 'name',          label: 'Name',          default: true, sortable: true, sortKey: 'title' },
    { key: 'version',       label: 'Mod Version',   default: true, sortable: true, sortKey: 'version' },
    { key: 'factorio',      label: 'Factorio Version', default: true, sortable: false },
    { key: 'size',          label: 'File Size',     default: false, sortable: true, sortKey: 'file_size' },
];

const ModList = ({mods, factorioVersion, updateMod, toggleMod, deleteMod, addUpdatableMod = null, disabled = false}) => {

    const { t } = useTranslation('mods');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [visibleCols, setVisibleCols] = useState(() => {
        const saved = localStorage.getItem('modlist_cols');
        if (saved) {
            try { return JSON.parse(saved); } catch {}
        }
        return COLUMNS.filter(c => c.default).map(c => c.key);
    });
    const [showSettings, setShowSettings] = useState(false);

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
        if (sortCol === colKey) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(colKey);
            setSortDir('asc');
        }
    };

    const toggleCol = (key) => {
        setVisibleCols(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            localStorage.setItem('modlist_cols', JSON.stringify(next));
            return next;
        });
    };

    const toggleDLC = () => {
        dlcMods.forEach(m => {
            if (dlcEnabled === m.enabled) toggleMod(m.name);
        });
    };

    const SortIcon = ({colKey}) => {
        if (sortCol !== colKey) return <FontAwesomeIcon icon={faSort} className="ml-1 text-gray-light opacity-50"/>;
        return <FontAwesomeIcon icon={sortDir === 'asc' ? faSortUp : faSortDown} className="ml-1"/>;
    };

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
            <table className="w-full">
                <thead>
                    <tr className="text-left py-1">
                        {vis('compatibility') && <th className="cursor-pointer select-none" onClick={() => handleSort('compatibility')}>{t('Compatibility')}<SortIcon colKey="compatibility"/></th>}
                        {vis('enabled') && <th className="cursor-pointer select-none" onClick={() => handleSort('enabled')}>{t('Enabled')}<SortIcon colKey="enabled"/></th>}
                        {vis('name') && <th className="cursor-pointer select-none" onClick={() => handleSort('name')}>{t('Name')}<SortIcon colKey="name"/></th>}
                        {vis('version') && <th className="cursor-pointer select-none" onClick={() => handleSort('version')}>{t('Mod Version')}<SortIcon colKey="version"/></th>}
                        {vis('factorio') && <th>{t('Factorio Version')}</th>}
                        {vis('size') && <th className="cursor-pointer select-none" onClick={() => handleSort('size')}>{t('File Size')}<SortIcon colKey="size"/></th>}
                        <th style={{width: 30}}/>
                    </tr>
                </thead>
                <tbody>
                    {factorioVersion !== null && dlcMods.length > 0 && (
                        <tr className="py-1 bg-blue-50 hover:bg-blue-100">
                            {vis('compatibility') && <td className="pr-4"><FontAwesomeIcon className="text-green" icon={faCheck}/></td>}
                            {vis('enabled') && <td className="pr-4">
                                {disabled
                                    ? dlcEnabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>
                                    : dlcEnabled
                                        ? <FontAwesomeIcon className="cursor-pointer hover:text-green-light text-green" icon={faToggleOn} onClick={toggleDLC}/>
                                        : <FontAwesomeIcon className="cursor-pointer hover:text-red-light text-red" icon={faToggleOff} onClick={toggleDLC}/>
                                }
                            </td>}
                            {vis('name') && <td className="pr-4 italic text-blue-600">{t('Space Age DLC')}</td>}
                            {vis('version') && <td className="pr-4">{dlcMods[0]?.version}</td>}
                            {vis('factorio') && <td className="pr-4">{dlcMods[0]?.factorio_version}</td>}
                            {vis('size') && <td className="pr-4 text-gray-light text-sm">-</td>}
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
