import client from "../client";

const api = (name) => {
    const prefix = name ? `/api/instance/${name}` : '/api';
    return {
        server: {
            list: async () => {
                const response = await client.get(`${prefix}/settings`);
                return response.data;
            },
            update: async (data) => {
                const response = await client.post(`${prefix}/settings/update`, data);
                return response.data;
            }
        },
        game: {
            list: async () => {
                const response = await client.get(`${prefix}/config`);
                return response.data;
            }
        }
    };
};

const d = api();

export default {
    ...d,
    forInstance: (name) => api(name),
};
