import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import log from "../../api/resources/log";
import Panel from "../components/Panel";

const Logs = () => {

    const { t } = useTranslation('logs');

    const [logs, setLogs] = useState([])

    useEffect(() => {
        (async () => {
            const logs = await log.tail()
            setLogs(logs);
        })();
    }, [])

    return (
        <Panel
            title={t('logs')}
            content={
                <ul>
                    {logs.map((log,index) => (<li key={index}>{log}</li>))}
                </ul>
            }
        />
    );
}

export default Logs;