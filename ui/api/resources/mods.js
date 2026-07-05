import client from "../client";

const api = (name) => {
    const prefix = name ? `/api/instance/${name}` : '/api';
    return {
        installed: async () => { const r = await client.get(`${prefix}/mods/list`); return r.data; },
        toggle: async (modName) => { const r = await client.post(`${prefix}/mods/toggle`, {name: modName}); return r.data; },
        delete: async (modName) => { const r = await client.post(`${prefix}/mods/delete`, {name: modName}); return r.data; },
        update: async (modName, downloadUrl, fileName) => {
            const r = await client.post(`${prefix}/mods/update`, {modName, downloadUrl, fileName}); return r.data;
        },
        upload: async (file) => {
            const fd = new FormData(); fd.append("modfile", file);
            const r = await client.post(`${prefix}/mods/upload`, fd, {headers:{"Content-Type":"multipart/form-data"}}); return r.data;
        },
        deleteAll: async () => { const r = await client.post(`${prefix}/mods/delete/all`); return r.data; },
        getFromSave: async (saveFile) => { const r = await client.post(`/api/saves/mods/list`, {saveFile}); return r.data; },
        syncFromSave: async (saveFile, modNames) => { const r = await client.post(`/api/saves/mods/sync`, {saveFile, modNames}); return r.data; },
        cancelSync: async () => { const r = await client.post(`/api/saves/mods/sync/cancel`); return r.data; },
        downloadAllURL: `${prefix}/mods/download`,
        portal: {
            login: async (username, token) => { const r = await client.post(`/api/mods/portal/login`, {username, token}); return r.data; },
            status: async () => { const r = await client.get(`/api/mods/portal/loginstatus`); return r.data; },
            logout: async () => { const r = await client.get(`/api/mods/portal/logout`); return r.data; },
            installMultiple: async (mods) => { const r = await client.post(`/api/mods/portal/install/multiple`, mods); return r.data; },
            install: async (mod, version) => { const r = await client.post(`/api/mods/portal/install`, {name:mod, version}); return r.data; },
            list: async () => { const r = await client.get(`/api/mods/portal/list`); return r.data; },
            info: async (mod) => {
                if (Array.isArray(mod)) { const results = []; for (const m of mod) { const r = await client.get(`/api/mods/portal/info/${m}`); results.push(r.data); } return results; }
                else { const r = await client.get(`/api/mods/portal/info/${mod}`); return r.data; }
            },
        },
        packs: {
            list: async () => { const r = await client.get(`/api/mods/packs/list`); return r.data; },
            create: async (name) => { const r = await client.post(`/api/mods/packs/create`, {name}); return r.data; },
            delete: async (name) => { const r = await client.post(`/api/mods/packs/${name}/delete`); return r.data; },
            download: async (name) => { const r = await client.get(`/api/mods/packs/${name}/download`); return r.data; },
            load: async (name) => { const r = await client.post(`/api/mods/packs/${name}/load`); return r.data; },
            listMods: async (pn) => { const r = await client.get(`/api/mods/packs/${pn}/list`); return r.data; },
            toggle: async (pn, mn) => { const r = await client.post(`/api/mods/packs/${pn}/mod/toggle`, {modName: mn}); return r.data; },
            update: async (pn, mn, dl, fn) => { const r = await client.post(`/api/mods/packs/${pn}/mod/update`, {modName: mn, downloadUrl: dl, fileName: fn}); return r.data; },
            deleteMod: async (pn, mn) => { const r = await client.post(`/api/mods/packs/${pn}/mod/delete`, {modName: mn}); return r.data; },
        }
    };
};

const d = api();
export default { ...d, forInstance: (name) => api(name) };
