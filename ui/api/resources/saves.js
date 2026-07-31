import client from "../client";

const api = (name) => ({
    list: async (latest) => {
        const base = name ? `/api/instance/${name}/saves` : '/api/saves';
        const response = await client.get(`${base}/list`, { params: { latest } });
        return response.data;
    },
    delete: async (save) => {
        const base = name ? `/api/instance/${name}/saves` : '/api/saves';
        const response = await client.get(`${base}/rm/${save.name}`);
        return response.data;
    },
    create: async (saveName) => {
        const base = name ? `/api/instance/${name}/saves` : '/api/saves';
        const response = await client.get(`${base}/create/${saveName}`);
        return response.data;
    },
    upload: async (file) => {
        let formData = new FormData();
        formData.append("savefile", file);
        const base = name ? `/api/instance/${name}/saves` : '/api/saves';
        const response = await client.post(`${base}/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" }
        });
        return response.data;
    },
    mods: async (save) => {
        const response = await client.post("/api/saves/mods", { saveFile: save });
        return response.data;
    }
});

export default {
    list: (latest) => api().list(latest),
    delete: (save) => api().delete(save),
    create: (name) => api().create(name),
    upload: (file) => api().upload(file),
    mods: (save) => api().mods(save),
    forInstance: (name) => api(name),
};
