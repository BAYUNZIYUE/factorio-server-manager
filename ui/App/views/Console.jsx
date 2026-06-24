import Panel from "../components/Panel";
import React, {useEffect, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import socket from "../../api/socket";
import log from "../../api/resources/log";

const Console = ({serverStatus}) => {

    const { t } = useTranslation('console');
    const [logs, setLogs] = useState([]);
    const consoleInput = useRef(null);
    const logEnd = useRef(null);

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
                        <div className="flex-1 overflow-y-auto bg-black rounded-sm p-2 mb-4 font-mono text-xs text-green-light"
                             style={{ minHeight: 0 }}>
                            {logs?.map((log, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all">{log}</div>
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
