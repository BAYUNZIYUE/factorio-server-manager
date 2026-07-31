import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCog, faSort, faSortUp, faSortDown, faCheck, faTimes, faToggleOn, faToggleOff, faUpRightFromSquare, faDownload, faRotate, faTrashAlt} from "@fortawesome/free-solid-svg-icons";
import Mod from "./Mod";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from "@tanstack/react-table";
import { useTranslation } from 'react-i18next';

const DLC_MODS = new Set(['elevated-rails', 'quality', 'space-age']);
const INIT_VIS = { compatibility: true, enabled: true, name: true, version: true, factorio: true, size: false, actions: true };
const loadVis = () => { try { const s = localStorage.getItem('modlist_cols_v3'); if (s) { const v = JSON.parse(s); v.name = true; return v; } } catch {} return INIT_VIS; };
const loadWidths = () => { try { return JSON.parse(localStorage.getItem('modlist_widths_v3') || '{}'); } catch { return {}; } };
const saveWidths = (w) => localStorage.setItem('modlist_widths_v3', JSON.stringify(w));

const COLS_ORDER = Object.keys(INIT_VIS).filter(k => k !== 'actions');
const DEF_SIZES = { compatibility: 80, enabled: 70, name: 200, version: 100, factorio: 140, size: 80, actions: 110 };
const MIN_PAD = 28;
const ICON_WIDTH = 16;
const IDX_WIDTH = 40;

const ModList = ({mods, factorioVersion, updateMod, toggleMod, deleteMod, addUpdatableMod, disabled = false}) => {
    const { t, i18n } = useTranslation('mods');
    const [sorting, setSorting] = useState([]);
    const [columnVisibility, setColumnVisibility] = useState(loadVis);
    const [columnOrder, setColumnOrder] = useState(() => {
        const saved = localStorage.getItem('modlist_colorder_v2');
        return saved ? JSON.parse(saved) : COLS_ORDER;
    });
    const [showSettings, setShowSettings] = useState(false);
    const [resizing, setResizing] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);
    const [autoFitReady, setAutoFitReady] = useState(false);
    const [, setTick] = useState(0);
    const dragCol = useRef(null);
    const colWidthsRef = useRef(loadWidths());
    const contentMinRef = useRef({});
    const containerRef = useRef(null);
    const persistWidths = useCallback(() => saveWidths(colWidthsRef.current), []);
    const settingsRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const dlcMods = useMemo(() => mods.filter(m => DLC_MODS.has(m.name)), [mods]);
    const regularMods = useMemo(() => mods.filter(m => !DLC_MODS.has(m.name)), [mods]);
    const sortedMods = useMemo(() => {
        if (sorting.length === 0) return regularMods;
        const { id, desc } = sorting[0];
        return [...regularMods].sort((a, b) => {
            const va = a[id], vb = b[id];
            if (va == null && vb == null) return 0;
            if (va == null) return desc ? -1 : 1;
            if (vb == null) return desc ? 1 : -1;
            const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
            return desc ? -cmp : cmp;
        });
    }, [regularMods, sorting]);

    const doMeasure = useCallback(() => {
        if (sortedMods.length === 0) return;
        const parent = containerRef.current || document.body;
        const run = () => {
            const span = document.createElement('span');
            span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
            parent.appendChild(span);
            const m = (text) => { span.textContent = text; return span.offsetWidth; };
            const saved = colWidthsRef.current;
            const cm = {};

            cm.compatibility = m(t('Compatibility')) + ICON_WIDTH + 4;
            cm.enabled = m(t('Enabled')) + ICON_WIDTH + 4;
            cm.version = m(t('Mod Version')) + ICON_WIDTH + 4;
            for (const mod of sortedMods) { const w = m(mod.version || ''); if (w > cm.version) cm.version = w; }
            cm.factorio = m(t('Game Ver'));
            for (const mod of sortedMods) {
                const v = mod.factorio_version || '';
                const parts = String(v).split('.'); while (parts.length > 2 && parts[parts.length-1] === '0') parts.pop();
                const w = m('≥ ' + parts.join('.')); if (w > cm.factorio) cm.factorio = w;
            }
            cm.actions = m(t('Other Actions'));
            cm.size = m(t('File Size')) + ICON_WIDTH + 4;
            for (const mod of sortedMods) { const label = mod.file_size > 0 ? ((mod.file_size/1024).toFixed(0)+' KB') : '-'; const w = m(label); if (w > cm.size) cm.size = w; }
            cm.name = ICON_WIDTH + 4;
            for (const mod of sortedMods) { const w = m(mod.title || mod.name || ''); if (w > cm.name) cm.name = w; }
            parent.removeChild(span);

            contentMinRef.current = cm;
            const nw = { ...saved };
            for (const [colId, minW] of Object.entries(cm)) {
                if (!saved[colId]) nw[colId] = minW + MIN_PAD;
            }
            colWidthsRef.current = nw;
            setAutoFitReady(true);
        };
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(run);
        } else {
            run();
        }
    }, [sortedMods, t]);

    useEffect(() => { doMeasure(); }, [doMeasure]);

    useEffect(() => {
        let timer;
        const onResize = () => {
            clearTimeout(timer);
            timer = setTimeout(() => doMeasure(), 200);
        };
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('resize', onResize); clearTimeout(timer); };
    }, [doMeasure]);

    useEffect(() => {
        if (!autoFitReady) return;
        const el = containerRef.current;
        if (!el) return;
        const recalc = () => {
            const cm = contentMinRef.current;
            let fixedSum = IDX_WIDTH;
            for (const colId of Object.keys(DEF_SIZES)) {
                if (colId === 'name' || !columnVisibility[colId]) continue;
                fixedSum += colWidthsRef.current[colId] || (cm[colId] != null ? cm[colId] + MIN_PAD : DEF_SIZES[colId]);
            }
            const avail = el.clientWidth - fixedSum;
            const nameMin = cm.name != null ? cm.name + MIN_PAD : DEF_SIZES.name;
            colWidthsRef.current = { ...colWidthsRef.current, name: Math.max(nameMin, avail) };
            setTick(t => t + 1);
        };
        recalc();
        const ro = new ResizeObserver(recalc);
        ro.observe(el);
        return () => ro.disconnect();
    }, [autoFitReady, columnVisibility]);

    useEffect(() => {
        if (!resizing) return;
        const onMove = (e) => {
            const diff = e.clientX - resizing.startX;
            const newWidth = Math.max(40, resizing.startWidth + diff);
            colWidthsRef.current = { ...colWidthsRef.current, [resizing.colId]: newWidth };
            setResizing(prev => prev ? { ...prev, _tick: Date.now() } : null);
        };
        const onUp = () => { persistWidths(); setResizing(null); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [resizing, persistWidths]);

    const dlcEnabled = dlcMods.some(m => m.enabled);
    const toggleDLC = () => { dlcMods.forEach(m => { if (dlcEnabled === m.enabled) toggleMod(m.name); }); };

    const visibleCols = useMemo(() => Object.entries(columnVisibility).filter(([,v]) => v).map(([k]) => k), [columnVisibility]);
    const vis = useCallback((key) => columnVisibility[key], [columnVisibility]);

    const columns = useMemo(() => [
        { id: 'compatibility', accessorKey: 'compatibility', header: t('Compatibility'), size: DEF_SIZES.compatibility, enableSorting: true,
            cell: ({ row }) => <div className="text-center">{row.original.compatibility ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>}</div>,
        },
        { id: 'enabled', accessorKey: 'enabled', header: t('Enabled'), size: DEF_SIZES.enabled, enableSorting: true,
            cell: ({ row }) => {
                const m = row.original;
                const isDLC = DLC_MODS.has(m.name);
                if (isDLC) return <div className="text-center">{m.enabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>}</div>;
                return (<div className="text-center">{disabled ? (m.enabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>) : m.enabled ? <FontAwesomeIcon className="cursor-pointer hover:text-green-light text-green" icon={faToggleOn} onClick={() => toggleMod(m.name)}/> : <FontAwesomeIcon className="cursor-pointer hover:text-red-light text-red" icon={faToggleOff} onClick={() => toggleMod(m.name)}/>}</div>);
            },
        },
        { id: 'name', accessorKey: 'name', header: t('Name'), size: DEF_SIZES.name, enableSorting: true,
            cell: ({ row }) => <Mod mod={row.original} factorioVersion={factorioVersion} updateMod={updateMod} toggleMod={toggleMod} deleteMod={deleteMod} addUpdatableMod={addUpdatableMod} disabled={disabled} allMods={regularMods} visibleCols={visibleCols} index={row.index + 1} tableMode={true} />,
        },
        { id: 'version', accessorKey: 'version', header: t('Mod Version'), size: DEF_SIZES.version, enableSorting: true,
            cell: ({ row }) => <span>{row.original.version}</span>,
        },
        { id: 'factorio', header: t('Game Ver'), size: DEF_SIZES.factorio, enableSorting: false,
            cell: ({ row }) => { const v = row.original.factorio_version || ''; const parts = String(v).split('.'); while (parts.length > 2 && parts[parts.length-1] === '0') parts.pop(); return <span>≥ {parts.join('.')}</span>; },
        },
        { id: 'size', accessorKey: 'size', header: t('File Size'), size: DEF_SIZES.size, enableSorting: true,
            cell: ({ row }) => <span className="text-gray-light text-sm">{row.original.file_size > 0 ? ((row.original.file_size/1024).toFixed(0)+' KB') : '-'}</span>,
        },
        { id: 'actions', header: t('Other Actions'), size: DEF_SIZES.actions, enableSorting: false, enableReorder: false,
            cell: ({ row }) => {
                const m = row.original;
                if (disabled || DLC_MODS.has(m.name)) return null;
                return (<div className="text-center"><FontAwesomeIcon icon={faUpRightFromSquare} className="text-gray-light cursor-pointer hover:text-white mx-1" title="模组门户" onClick={() => window.open('https://mods.factorio.com/mod/' + m.name, '_blank')}/><FontAwesomeIcon icon={faDownload} className="text-gray-light cursor-pointer hover:text-white mx-1" title="下载模组"/><FontAwesomeIcon icon={faRotate} className="text-gray-light cursor-pointer hover:text-orange mx-1" title="修复模组"/><FontAwesomeIcon icon={faTrashAlt} className="text-red cursor-pointer hover:text-red-light mx-1" title="删除模组" onClick={() => deleteMod(m.name)}/></div>);
            },
        },
    ], [t, factorioVersion, updateMod, toggleMod, deleteMod, addUpdatableMod, disabled, regularMods, visibleCols]);

    const table = useReactTable({
        data: sortedMods,
        columns,
        state: { sorting, columnVisibility, columnOrder },
        onSortingChange: setSorting,
        onColumnVisibilityChange: updater => {
            setColumnVisibility(prev => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                next.name = true;
                localStorage.setItem('modlist_cols_v3', JSON.stringify(next));
                return next;
            });
        },
        onColumnOrderChange: updater => {
            setColumnOrder(prev => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                localStorage.setItem('modlist_colorder_v2', JSON.stringify(next));
                return next;
            });
        },
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const onResizeStart = useCallback((e, colId) => {
        e.preventDefault();
        colWidthsRef.current = { ...colWidthsRef.current };
        setResizing({ colId, startX: e.clientX, startWidth: colWidthsRef.current[colId] || DEF_SIZES[colId] || 100 });
    }, []);

    const onDragStart = useCallback((e, colId) => {
        dragCol.current = colId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', colId);
    }, []);

    const onDragOver = useCallback((e, colId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragCol.current !== colId) setDragOverCol(colId);
    }, []);

    const onDragLeave = useCallback(() => { setDragOverCol(null); }, []);

    const onDrop = useCallback((e, targetId) => {
        e.preventDefault();
        setDragOverCol(null);
        const src = dragCol.current;
        if (!src || src === targetId) return;
        setColumnOrder(prev => {
            const a = [...prev];
            const i1 = a.indexOf(src), i2 = a.indexOf(targetId);
            if (i1 >= 0 && i2 >= 0) { a.splice(i1, 1); a.splice(i2, 0, src); }
            return a;
        });
    }, []);

    const getColWidth = useCallback((colId) => {
        return colWidthsRef.current[colId] || DEF_SIZES[colId] || 100;
    }, []);

    const toggleCol = useCallback((key) => {
        if (key === 'name') return;
        setColumnVisibility(prev => {
            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem('modlist_cols_v3', JSON.stringify(next));
            return next;
        });
    }, []);

    const visibleLeaves = table.getVisibleLeafColumns();
    const colIds = visibleLeaves.map(c => c.id);

    return (
        <div className="overflow-x-auto max-w-full" ref={containerRef}>
            <table className="whitespace-nowrap" style={{ tableLayout: 'fixed', width: table.getCenterTotalSize() }}>
                <thead>
                    {table.getHeaderGroups().map(hg => (
                        <tr key={hg.id} className="text-left border-b-2 border-gray sticky top-0 z-10 bg-gray-dark">
                            <th className="border-r border-gray relative sticky left-0 z-[15] bg-gray-dark" style={{ width: IDX_WIDTH }}>
                                <div className="flex items-center justify-center h-10 relative" ref={settingsRef}>
                                    <button className="text-gray-light hover:text-white text-sm px-1"
                                        onClick={() => setShowSettings(!showSettings)}
                                        title={t('columns')}>
                                        <FontAwesomeIcon icon={faCog}/>
                                    </button>
                                    {showSettings && (
                                        <div className="absolute left-0 top-full mt-1 bg-gray-dark border border-gray-medium rounded-sm p-2 z-20 shadow-xl text-xs w-36">
                                            {columns.filter(c => c.id !== 'actions' && c.id !== 'name').map(c => (
                                                <label key={c.id} className="flex items-center gap-1 py-0.5 cursor-pointer text-gray-light hover:text-white whitespace-nowrap">
                                                    <input type="checkbox" checked={vis(c.id)} onChange={() => toggleCol(c.id)} className="mr-1"/>
                                                    {typeof c.header === 'string' ? c.header : c.id}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </th>
                            {hg.headers.map(header => {
                                const c = header.column;
                                const dragging = dragOverCol === c.id;
                                return (
                                    <th key={header.id}
                                        className="px-2 relative border-r border-gray select-none transition-colors bg-gray-dark"
                                        style={{ width: getColWidth(c.id), cursor: c.getCanSort() ? 'pointer' : 'default',
                                            borderLeft: dragging ? '3px solid #5C8FFF' : undefined,
                                            opacity: dragging ? 0.6 : 1 }}
                                        draggable={c.id !== 'actions'}
                                        onDragStart={(e) => onDragStart(e, c.id)}
                                        onDragOver={(e) => onDragOver(e, c.id)}
                                        onDragLeave={onDragLeave}
                                        onDrop={(e) => onDrop(e, c.id)}>
                                        <div className="flex items-center gap-1 overflow-hidden"
                                            onClick={c.getCanSort() ? c.getToggleSortingHandler() : undefined}>
                                            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{flexRender(c.columnDef.header, header.getContext())}</span>
                                            {c.getIsSorted() === 'asc' ? <FontAwesomeIcon icon={faSortUp} className="text-xs pointer-events-none"/> :
                                             c.getIsSorted() === 'desc' ? <FontAwesomeIcon icon={faSortDown} className="text-xs pointer-events-none"/> :
                                             c.getCanSort() ? <FontAwesomeIcon icon={faSort} className="text-xs text-gray opacity-40 pointer-events-none"/> : null}
                                        </div>
                                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 group"
                                            onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, c.id); }}>
                                            <div className="absolute right-0 top-1 bottom-1 w-px bg-gray-medium"/>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {factorioVersion !== null && dlcMods.length > 0 && (
                        <tr className="border-b border-gray-dark bg-blue-50 hover:bg-blue-100">
                            <td className="text-gray-light text-xs text-center sticky left-0 z-[5] bg-[#1C1C1C]">DLC</td>
                            {colIds.map(colId => {
                                if (colId === 'actions') return <td key={colId}/>;
                                if (colId === 'compatibility') return <td key={colId} className="px-2 text-center"><FontAwesomeIcon className="text-green" icon={faCheck}/></td>;
                                if (colId === 'enabled') return <td key={colId} className="px-2 text-center">{disabled ? (dlcEnabled ? <FontAwesomeIcon className="text-green" icon={faCheck}/> : <FontAwesomeIcon className="text-red" icon={faTimes}/>) : (dlcEnabled ? <FontAwesomeIcon className="cursor-pointer hover:text-green-light text-green" icon={faToggleOn} onClick={toggleDLC}/> : <FontAwesomeIcon className="cursor-pointer hover:text-red-light text-red" icon={faToggleOff} onClick={toggleDLC}/>)}</td>;
                                if (colId === 'name') return <td key={colId} className="px-2 italic text-blue-600">{t('Space Age DLC')}</td>;
                                if (colId === 'version') return <td key={colId} className="px-2">{dlcMods[0]?.version}</td>;
                                if (colId === 'factorio') return <td key={colId} className="px-2">≥ {dlcMods[0]?.factorio_version}</td>;
                                if (colId === 'size') return <td key={colId} className="px-2 text-gray-light text-sm">-</td>;
                                return <td key={colId}/>;
                            })}
                        </tr>
                    )}
                    {table.getRowModel().rows.map(row => (
                        <tr key={row.id} className="py-1 border-b border-gray-dark">
                            <td className="text-gray-light text-xs text-center sticky left-0 z-[5] bg-[#1C1C1C]" style={{height: 40}}>{row.index + 1}</td>
                            {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="pr-4 overflow-hidden text-ellipsis">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ModList;
