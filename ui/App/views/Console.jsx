import Panel from "../components/Panel";
import React, {useEffect, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import socket from "../../api/socket";
import log from "../../api/resources/log";

const FONT_SIZES = { small: 'text-xs', medium: 'text-sm', large: 'text-base' };

const Console = ({serverStatus}) => {

    const { t } = useTranslation('console');
    const [logs, setLogs] = useState([]);
    const [fontSize, setFontSize] = useState(() => localStorage.getItem('console_fontSize') || 'small');
    const [wrap, setWrap] = useState(() => localStorage.getItem('console_wrap') !== 'false');
    const consoleInput = useRef(null);
    const logEnd = useRef(null);

    const setFont = (size) => {
        setFontSize(size);
        localStorage.setItem('console_fontSize', size);
    };
    const toggleWrap = () => {
        const next = !wrap;
        setWrap(next);
        localStorage.setItem('console_wrap', String(next));
    };

    useEffect(() => {
        (async () => {
            const lines = await log.tail();
            if (lines && Array.isArray(lines)) setLogs(lines);
        })();

        const appendLog = line => {
            setLogs(lines => [...lines, line]);
        };

        socket.on('gamelog', appendLog);
        socket.emit('log subscribe');
        consoleInput.current?.focus();

        return () => {
            socket.off('gamelog', appendLog);
            socket.emit("log unsubscribe");
        };
    }, []);

    useEffect(() => {
        logEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <Panel
                title={t('console')}
                content={
                    <div className="flex flex-col" style={{ height: 'calc(100vh - 320px)' }}>
                        <div className="flex-none flex items-center gap-1 mb-2 text-xs text-gray-light">
                            <span className="mr-2">{t('fontSize')}:</span>
                            {Object.keys(FONT_SIZES).map(s => (
                                <button key={s}
                                    className={`px-2 py-0.5 rounded ${fontSize === s ? 'bg-orange text-black' : 'bg-gray-dark hover:bg-gray-light'}`}
                                    onClick={() => setFont(s)}>
                                    {t(s)}
                                </button>
                            ))}
                            <span className="ml-4 mr-2">{t('wrap')}:</span>
                            <button
                                className={`px-2 py-0.5 rounded ${wrap ? 'bg-orange text-black' : 'bg-gray-dark hover:bg-gray-light'}`}
                                onClick={toggleWrap}>
                                {wrap ? t('on') : t('off')}
                            </button>
                        </div>
                        <div className={`flex-1 overflow-y-auto bg-black rounded-sm p-2 mb-4 font-mono text-green-light ${FONT_SIZES[fontSize]}`}
                             style={{ minHeight: 0, whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowX: wrap ? 'hidden' : 'auto' }}>
                            {logs?.map((log, i) => (
                                <div key={i} className={wrap ? 'break-all' : ''}>{log}</div>
                            ))}
                            <div ref={logEnd} />
                        </div>
                        <div className="flex-none">
                            {serverStatus.running
                                ? <input type="text"
                                         className="shadow appearance-none border w-full py-2 px-3 text-black font-mono"
                                         ref={consoleInput}
                                         placeholder={t('placeholder')}
                                         onKeyDown={e => {
                                             if (e.key === "Enter" && socket) {
                                                 socket.emit("command send", consoleInput.current.value);
                                                 consoleInput.current.value = "";
                                             }
                                         }}
                                  />
                                : <p className="text-gray-light text-sm pt-2">{t('consoleNotAvailable')}</p>
                            }
                        </div>
                    </div>
                }
            />
        </div>
    );
};

export default Console;
