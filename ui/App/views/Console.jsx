import Panel from "../components/Panel";
import React, {useEffect, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import socket from "../../api/socket";
import log from "../../api/resources/log";

const FONT_CLASS = { small: 'text-xs', medium: 'text-sm', large: 'text-base' };
const WIDTH = { compact: {maxWidth: '56rem'}, normal: {maxWidth: '72rem'}, full: {maxWidth: 'none'} };

const Console = ({serverStatus}) => {

    const { t } = useTranslation('console');
    const [logs, setLogs] = useState([]);
    const [fontSize, setFontSize] = useState(() => { try { return localStorage.getItem('console_fontSize') || 'small'; } catch { return 'small'; } });
    const [wrap, setWrap] = useState(() => { try { return localStorage.getItem('console_wrap') !== 'false'; } catch { return true; } });
    const [panelWidth, setPanelWidth] = useState(() => { try { return localStorage.getItem('console_panelWidth') || 'normal'; } catch { return 'normal'; } });
    const consoleInput = useRef(null);
    const logEnd = useRef(null);

    const setFont = (size) => { setFontSize(size); try { localStorage.setItem('console_fontSize', size); } catch {} };
    const toggleWrap = () => { const n = !wrap; setWrap(n); try { localStorage.setItem('console_wrap', String(n)); } catch {} };
    const setW = (w) => { setPanelWidth(w); try { localStorage.setItem('console_panelWidth', w); } catch {} };

    useEffect(() => {
        (async () => {
            try { const lines = await log.tail(); if (lines && Array.isArray(lines)) setLogs(lines); } catch {}
        })();
        const appendLog = line => setLogs(lines => [...lines, line]);
        socket.on('gamelog', appendLog);
        socket.emit('log subscribe');
        consoleInput.current?.focus();
        return () => { socket.off('gamelog', appendLog); socket.emit("log unsubscribe"); };
    }, []);

    useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    return (
        <div className="flex flex-col" style={{ minHeight: '70vh' }}>
            <div className="flex-none flex flex-wrap items-center gap-1 mb-2 text-xs text-gray-light"
                 style={{ ...WIDTH[panelWidth], margin: '0 auto', width: '100%' }}>
                <span className="mr-1">{t('fontSize')}:</span>
                {Object.keys(FONT_CLASS).map(s => (
                    <button key={s} className={`px-2 py-0.5 rounded ${fontSize === s ? 'bg-orange text-black' : 'bg-gray-dark hover:bg-gray-light'}`}
                        onClick={() => setFont(s)}>{t(s)}</button>
                ))}
                <span className="ml-3 mr-1 hidden sm:inline">{t('wrap')}:</span>
                <button className={`px-2 py-0.5 rounded hidden sm:inline ${wrap ? 'bg-orange text-black' : 'bg-gray-dark hover:bg-gray-light'}`}
                    onClick={toggleWrap}>{wrap ? t('on') : t('off')}</button>
                <span className="ml-3 mr-1">{t('width')}:</span>
                {Object.keys(WIDTH).map(w => (
                    <button key={w} className={`px-2 py-0.5 rounded ${panelWidth === w ? 'bg-orange text-black' : 'bg-gray-dark hover:bg-gray-light'}`}
                        onClick={() => setW(w)}>{t(w)}</button>
                ))}
            </div>
            <div style={{ ...WIDTH[panelWidth], margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Panel title={t('console')} content={
                    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
                        <div className="flex-1 overflow-y-auto bg-black rounded-sm p-2 mb-4 font-mono text-green-light"
                             style={{ minHeight: '40vh', whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowX: wrap ? 'hidden' : 'auto' }}>
                            <div className={FONT_CLASS[fontSize]}>
                                {logs?.map((l, i) => (<div key={i} className={wrap ? 'break-all' : ''}>{l}</div>))}
                                <div ref={logEnd} />
                            </div>
                        </div>
                        <div className="flex-none">
                            {serverStatus.running
                                ? <input type="text" className="shadow appearance-none border w-full py-2 px-3 text-black font-mono"
                                         ref={consoleInput} placeholder={t('placeholder')}
                                         onKeyDown={e => { if (e.key === "Enter" && socket) { socket.emit("command send", consoleInput.current.value); consoleInput.current.value = ""; } }}/>
                                : <p className="text-gray-light text-sm pt-2">{t('consoleNotAvailable')}</p>}
                        </div>
                    </div>
                }/>
            </div>
        </div>
    );
};

export default Console;
