import client from "../client";

const api = (name) => {
    const prefix = name ? `/api/instance/${name}` : '/api';
    return {
        installed: async () => {
            const response = await client.get(`${prefix}/mods/list`);
            return response.data;
        },
        toggle: async (modName) => {
            const response = await client.post(`${prefix}/mods/toggle`, { name: modName });
            return response.data;
        },
        delete: async (modName) => {
            const response = await client.post(`${prefix}/mods/delete`, { name: modName });
            return response.data;
        },
        update: async (modName, downloadUrl, fileName) => {
            const response = await client.post(`${prefix}/mods/update`, { modName, downloadUrl, fileName });
            return response.data;
        },
        upload: async (file) => {
            let formData = new FormData();
            formData.append("modfile", file);
            const response = await client.post(`${prefix}/mods/upload`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            return response.data;
        },
        deleteAll: async () => {
            const response = await client.post(`${prefix}/mods/delete/all`);
            return response.data;
        },
        saveMods: async (saveFile) => {
            const response = await client.post(`/api/saves/mods/list`, { saveFile });
            return response.data;
        },
        syncFromSave: async (saveFile, modNames) => {
            const response = await client.post(`/api/saves/mods/sync`, { saveFile, modNames });
            return response.data;
        },
        cancelSync: async () => {
            const response = await client.post(`/api/saves/mods/sync/cancel`);
            return response.data;
        },
        downloadAllURL: `${prefix}/mods/download`,
        portalLogin: async (username, password, token) => {
            const response = await client.post(`/api/mods/portal/login`, { username, password, token });
            return response.data;
        },
        portalLoginStatus: async () => {
            const response = await client.get(`/api/mods/portal/loginstatus`);
            return response.data;
        },
        portalLogout: async () => {
            const response = await client.get(`/api/mods/portal/logout`);
            return response.data;
        },
        portalInstallMultiple: async (mods) => {
            const response = await client.post(`/api/mods/portal/install/multiple`, mods);
            return response.data;
        },
        portalInstall: async (modName, version) => {
            const response = await client.post(`/api/mods/portal/install`, { name: modName, version });
            return response.data;
        },
        portalList: async () => {
            const response = await client.get(`/api/mods/portal/list`);
            return response.data;
        },
        portalInfo: async (mod) => {
            if (Array.isArray(mod)) {
                const results = [];
                for (const m of mod) {
                    const response = await client.get(`/api/mods/portal/info/${m}`);
                    results.push(response.data);
                }
                return results;
            } else {
                const response = await client.get(`/api/mods/portal/info/${mod}`);
                return response.data;
            }
        },
        packs: {
            list: async () => {
                const response = await client.get(`/api/mods/packs/list`);
                return response.data;
            },
            create: async (name) => {
                const response = await client.post(`/api/mods/packs/create`, { name });
                return response.data;
            },
            delete: async (name) => {
                const response = await client.post(`/api/mods/packs/${name}/delete`);
                return response.data;
            },
            download: async (name) => {
                const response = await client.get(`/api/mods/packs/${name}/download`);
                return response.data;
            },
            load: async (name) => {
                const response = await client.post(`/api/mods/packs/${name}/load`);
                return response.data;
            },
            listMods: async (packName) => {
                const response = await client.get(`/api/mods/packs/${packName}/list`);
                return response.data;
            },
            toggle: async (packName, modName) => {
                const response = await client.post(`/api/mods/packs/${packName}/mod/toggle`, { modName });
                return response.data;
            },
            update: async (packName, modName, downloadUrl, fileName) => {
                const response = await client.post(`/api/mods/packs/${packName}/mod/update`, { modName, downloadUrl, fileName });
                return response.data;
            },
            deleteMod: async (packName, modName) => {
                const response = await client.post(`/api/mods/packs/${packName}/mod/delete`, { modName });
                return response.data;
            },
        }
    };
};

const d = api();

export default {
    ...d,
    forInstance: (name) => api(name),
};
