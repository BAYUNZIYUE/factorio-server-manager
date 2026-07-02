import EventEmitter from "events";

const bus = new EventEmitter();

const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";

const activeRooms = new Set();

function connect() {
    const socket = new WebSocket(ws_scheme + "://" + window.location.host + "/ws");

    function logSubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: "gamelog"}}));
    }

    function logUnsubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "unsubscribe", value: "gamelog"}}));
    }

    function serverStatusSubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: "server_status"}}));
    }

    function commandSendEvent(command) {
        socket.send(JSON.stringify({room_name: "", controls: {type: "command", value: command}}));
    }

    function modInstallSubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: "mod_install"}}));
    }

    function serverVersionSubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: "server_version"}}));
    }

    function modsSyncSubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: "mods_sync"}}));
    }

    function modsSyncUnsubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "unsubscribe", value: "mods_sync"}}));
    }

    function modsEventsSubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: "mods_events"}}));
    }

    function modsEventsUnsubscribeEvent() {
        socket.send(JSON.stringify({room_name: "", controls: {type: "unsubscribe", value: "mods_events"}}));
    }

    const roomSubs = {
        gamelog: logSubscribeEvent,
        server_status: serverStatusSubscribeEvent,
        mod_install: modInstallSubscribeEvent,
        server_version: serverVersionSubscribeEvent,
        mods_sync: modsSyncSubscribeEvent,
        mods_events: modsEventsSubscribeEvent,
    };

    function subscribe(room) {
        activeRooms.add(room);
        const fn = roomSubs[room];
        if (fn) fn();
    }

    function unsubscribe(room) {
        activeRooms.delete(room);
    }

    function registerEventEmitter() {
        bus.on('log subscribe',      () => subscribe('gamelog'));
        bus.on('log unsubscribe',    () => { unsubscribe('gamelog'); logUnsubscribeEvent(); });
        bus.on('server status subscribe', () => subscribe('server_status'));
        bus.on('command send',       commandSendEvent);
        bus.on('mods sync subscribe',     () => subscribe('mods_sync'));
        bus.on('mods sync unsubscribe',   () => { unsubscribe('mods_sync'); modsSyncUnsubscribeEvent(); });
        bus.on('mods events subscribe',   () => subscribe('mods_events'));
        bus.on('mods events unsubscribe', () => { unsubscribe('mods_events'); modsEventsUnsubscribeEvent(); });
        bus.on('server version subscribe', () => subscribe('server_version'));
        bus.on('mod install subscribe',    () => subscribe('mod_install'));
    }

    function unregisterEventEmitter() {
        bus.off('log subscribe',      () => subscribe('gamelog'));
        bus.off('log unsubscribe',    () => { unsubscribe('gamelog'); logUnsubscribeEvent(); });
        bus.off('server status subscribe', () => subscribe('server_status'));
        bus.off('command send',       commandSendEvent);
        bus.off('mods sync subscribe',     () => subscribe('mods_sync'));
        bus.off('mods sync unsubscribe',   () => { unsubscribe('mods_sync'); modsSyncUnsubscribeEvent(); });
        bus.off('mods events subscribe',   () => subscribe('mods_events'));
        bus.off('mods events unsubscribe', () => { unsubscribe('mods_events'); modsEventsUnsubscribeEvent(); });
        bus.off('server version subscribe', () => subscribe('server_version'));
        bus.off('mod install subscribe',    () => subscribe('mod_install'));
    }

    function resubscribeAll() {
        for (const room of activeRooms) {
            const fn = roomSubs[room];
            if (fn) fn();
        }
    }

    socket.onmessage = e => {
        const {room_name, message} = JSON.parse(e.data);
        bus.emit(room_name, message);
    }

    socket.onerror = e => {
        socket.close();
    }

    socket.onclose = e => {
        unregisterEventEmitter()
        setTimeout(connect, 5000);
    }

    socket.onopen = e => {
        registerEventEmitter()
        resubscribeAll()
    }
}

connect();

export default bus;
