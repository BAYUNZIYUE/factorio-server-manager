import React, { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInstances } from '../context/InstanceProvider';

const InstanceSwitcher = () => {
    const { name: currentName } = useParams();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);
    const { instances } = useInstances();

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const current = instances.find(i => i.name === currentName);
    const dotColor = (s) => {
        switch (s) { case 'running': return 'bg-green'; case 'starting': case 'stopping': return 'bg-yellow'; case 'error': return 'bg-gray'; default: return 'bg-red'; }
    };

    return (
        <div className="relative" ref={ref}>
            <button className="w-full bg-gray-medium text-dirty-white rounded-sm px-3 py-2 text-left flex items-center justify-between hover:bg-gray-light"
                onClick={() => setIsOpen(!isOpen)}>
                <span className="font-bold truncate">{current?.display_name || current?.name || currentName || '...'}</span>
                <span className="text-xs ml-2">\u25BC</span>
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-dark border border-gray-medium rounded-sm shadow-lg z-50">
                    {instances.map(inst => (
                        <Link key={inst.name} to={`/instance/${inst.name}`}
                            className={`flex items-center justify-between px-3 py-2 hover:bg-gray-medium text-dirty-white text-sm ${inst.name === currentName ? 'bg-gray-medium' : ''}`}
                            onClick={() => setIsOpen(false)}>
                            <span className="truncate">{inst.display_name || inst.name}</span>
                            <span className={`${dotColor(inst.status)} w-2 h-2 rounded-full flex-shrink-0 ml-2`}></span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};
export default InstanceSwitcher;
