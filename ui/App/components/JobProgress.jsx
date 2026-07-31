import React, { useState, useEffect, useRef } from 'react';

const J = { title: '任务队列', empty: '暂无进行中的任务', cancel: '取消' };

const statusLabel = (s) => {
    switch (s) {
        case 'pending': return '排队中';
        case 'running': return '进行中';
        case 'completed': return '完成';
        case 'failed': return '失败';
        case 'cancelled': return '已取消';
        default: return s;
    }
};

const statusColor = (s) => {
    switch (s) {
        case 'running': return 'bg-blue';
        case 'completed': return 'bg-green';
        case 'failed': return 'bg-red';
        case 'cancelled': return 'bg-gray';
        default: return 'bg-yellow';
    }
};

const JobProgress = () => {
    const [jobs, setJobs] = useState([]);
    const [expanded, setExpanded] = useState(false);
    const wsRef = useRef(null);

    const fetchJobs = async () => {
        try {
            const r = await fetch('/api/jobs');
            const data = await r.json();
            setJobs(data || []);
        } catch (e) { /* ignore */ }
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 3000);

        // WebSocket subscription for real-time updates
        const sock = new WebSocket(`ws://${window.location.host}/ws`);
        sock.onopen = () => {
            sock.send(JSON.stringify({ room_name: '', controls: { type: 'subscribe', value: 'jobs' } }));
            wsRef.current = sock;
        };
        sock.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.room_name === 'jobs' && msg.message) {
                    setJobs(msg.message || []);
                }
            } catch (ex) { /* ignore */ }
        };
        return () => {
            clearInterval(interval);
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'running');
    const hasActive = activeJobs.length > 0;
    const recentDone = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled').slice(0, 3);

    if (!hasActive && recentDone.length === 0) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50">
            <div className="bg-gray-dark border-t border-gray-medium shadow-lg mx-0 sm:mx-4 md:mx-8 rounded-t-sm">
                <div className="flex items-center justify-between px-4 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                    <div className="flex items-center gap-2">
                        <span className="text-dirty-white text-sm font-bold">{J.title}</span>
                        {hasActive && (
                            <span className="bg-blue rounded-full px-2 py-0.5 text-xs text-white">{activeJobs.length} 进行中</span>
                        )}
                    </div>
                    <span className="text-gray-light text-xs">{expanded ? '\u25BC' : '\u25B2'} {expanded ? '收起' : '展开'}</span>
                </div>

                {expanded && (
                    <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
                        {activeJobs.map(job => (
                            <div key={job.id} className="bg-gray-medium rounded-sm p-2">
                                <div className="flex justify-between items-center mb-1">
                                    <div>
                                        <span className="text-dirty-white text-sm">{job.name}</span>
                                        {job.instance_name && <span className="text-gray-light text-xs ml-2">({job.instance_name})</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`${statusColor(job.status)} rounded-full px-2 py-0.5 text-xs text-white`}>
                                            {statusLabel(job.status)}
                                        </span>
                                        {job.status === 'running' && (
                                            <button className="text-red text-xs hover:underline" onClick={async (e) => {
                                                e.stopPropagation();
                                                await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
                                            }}>{J.cancel}</button>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full bg-black rounded-full h-2 overflow-hidden">
                                    <div className="bg-blue h-full rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }}/>
                                </div>
                                {job.message && <div className="text-gray-light text-xs mt-1">{job.message}</div>}
                            </div>
                        ))}

                        {recentDone.length > 0 && activeJobs.length > 0 && (
                            <div className="text-gray-light text-xs border-t border-gray-medium pt-2">最近完成</div>
                        )}
                        {recentDone.map(job => (
                            <div key={job.id} className="bg-gray-medium rounded-sm p-2 opacity-70">
                                <div className="flex justify-between items-center">
                                    <span className="text-dirty-white text-sm">{job.name}</span>
                                    <span className="text-xs text-gray-light">{statusLabel(job.status)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default JobProgress;
