import React, {useState, useEffect, useRef} from "react";
import {eventLog} from "../eventLog";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrashCan, faCircle, faExclamationTriangle, faInfoCircle, faTimesCircle} from "@fortawesome/free-solid-svg-icons";

const TYPE_CONFIG = {
    error: {icon: faTimesCircle, color: "text-red", bg: "bg-red-900/20", label: "错误"},
    warn:  {icon: faExclamationTriangle, color: "text-yellow-500", bg: "bg-yellow-900/20", label: "警告"},
    info:  {icon: faInfoCircle, color: "text-blue-400", bg: "", label: "信息"},
    system:{icon: faCircle, color: "text-gray-light", bg: "", label: "系统"},
};

const EventLog = () => {
    const [items, setItems] = useState([]);
    const [filter, setFilter] = useState("all");
    const bottomRef = useRef(null);
    const autoScrollRef = useRef(true);

    useEffect(() => {
        setItems(eventLog.getAll());
        const unsub = eventLog.subscribe((entry) => {
            setItems(prev => [...prev, entry]);
        });
        return unsub;
    }, []);

    useEffect(() => {
        if (autoScrollRef.current && bottomRef.current) {
            bottomRef.current.scrollIntoView({behavior: "smooth"});
        }
    }, [items]);

    const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

    const counts = {
        all: items.length,
        error: items.filter(i => i.type === "error").length,
        warn: items.filter(i => i.type === "warn").length,
        info: items.filter(i => i.type === "info").length,
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-dirty-white">事件日志</h2>
                <button
                    className="text-sm text-gray-light hover:text-red flex items-center gap-1"
                    onClick={() => { eventLog.clear(); setItems([]); }}
                >
                    <FontAwesomeIcon icon={faTrashCan}/>
                    清空
                </button>
            </div>

            <div className="flex gap-2 mb-3">
                {(["all", "error", "warn", "info"]).map(key => (
                    <button
                        key={key}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                            filter === key
                                ? "bg-gray-light text-black"
                                : "bg-gray-dark text-gray-light hover:text-white"
                        }`}
                        onClick={() => setFilter(key)}
                    >
                        {key === "all" ? "全部" : TYPE_CONFIG[key]?.label || key}
                        <span className="ml-1 opacity-60">({counts[key] || 0})</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-dark rounded p-3 font-mono text-xs leading-relaxed">
                {filtered.length === 0 && (
                    <div className="text-gray-light text-center py-8">暂无日志</div>
                )}
                {filtered.map(entry => {
                    const cfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.info;
                    const time = entry.time ? entry.time.slice(11, 19) : "";
                    return (
                        <div
                            key={entry.id}
                            className={`flex items-start gap-2 py-0.5 border-b border-gray-dark/50 ${cfg.bg}`}
                        >
                            <span className="text-gray-light shrink-0 w-16">{time}</span>
                            <FontAwesomeIcon icon={cfg.icon} className={`${cfg.color} shrink-0 mt-0.5`} size="xs"/>
                            <span className="text-gray-light shrink-0 w-12">{cfg.label}</span>
                            <span className="text-gray-light shrink-0 w-16 truncate">{entry.source}</span>
                            <span className="text-dirty-white flex-1 break-all">{entry.message}</span>
                        </div>
                    );
                })}
                <div ref={bottomRef}/>
            </div>
        </div>
    );
};

export default EventLog;
