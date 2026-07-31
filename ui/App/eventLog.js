const MAX_EVENTS = 500;

let listeners = [];
let events = [];

export const eventLog = {
    add(event) {
        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            time: new Date().toISOString(),
            type: event.type || 'info',
            message: event.message || '',
            source: event.source || 'app',
        };
        events.push(entry);
        if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
        listeners.forEach(fn => fn(entry));
        return entry;
    },

    getAll() {
        return [...events];
    },

    clear() {
        events = [];
        listeners.forEach(fn => fn({type: 'system', message: 'log cleared', source: 'system'}));
    },

    subscribe(fn) {
        listeners.push(fn);
        return () => { listeners = listeners.filter(f => f !== fn); };
    },

    error(msg, source) {
        return this.add({type: 'error', message: String(msg), source: source || 'app'});
    },

    warn(msg, source) {
        return this.add({type: 'warn', message: String(msg), source: source || 'app'});
    },

    info(msg, source) {
        return this.add({type: 'info', message: String(msg), source: source || 'app'});
    },
};
