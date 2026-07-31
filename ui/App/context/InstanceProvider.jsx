import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../../api/socket';

const InstanceContext = createContext(null);

export function InstanceProvider({ children }) {
    const { name } = useParams();
    const [instance, setInstance] = useState(null);
    const [instanceStatus, setInstanceStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (name) => {
        setLoading(true);
        try {
            const [instResp, statusResp] = await Promise.all([
                fetch(`/api/instances/${name}`),
                fetch(`/api/instance/${name}/status`)
            ]);
            if (instResp.ok) setInstance(await instResp.json());
            if (statusResp.ok) setInstanceStatus(await statusResp.json());
        } catch (err) {
            console.error('Failed to fetch instance:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (name) fetchData(name);
        else setLoading(false);
    }, [name, fetchData]);

    useEffect(() => {
        if (!name) return;
        const room = `instance/${name}/server_status`;
        socket.subscribe(room);
        const handler = (data) => {
            try { setInstanceStatus(JSON.parse(data)); } catch (e) {}
        };
        socket.on(room, handler);
        return () => {
            socket.unsubscribe(room);
            socket.off(room, handler);
        };
    }, [name]);

    return (
        <InstanceContext.Provider value={{ instance, instanceStatus, loading }}>
            {children}
        </InstanceContext.Provider>
    );
}

export function useInstance() {
    const ctx = useContext(InstanceContext);
    return ctx || { instance: null, instanceStatus: null, loading: false };
}

export function useInstances() {
    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchInstances = useCallback(async () => {
        try {
            const res = await fetch('/api/instances');
            if (res.ok) setInstances(await res.json());
        } catch (err) {
            console.error('Failed to fetch instances:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInstances();
    }, [fetchInstances]);

    useEffect(() => {
        socket.subscribe('instances');
        const handler = () => fetchInstances();
        socket.on('instances', handler);
        return () => {
            socket.unsubscribe('instances');
            socket.off('instances', handler);
        };
    }, [fetchInstances]);

    return { instances, loading, refresh: fetchInstances };
}

export default InstanceContext;
