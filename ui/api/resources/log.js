import client from "../client";

const api = (name) => {
    const prefix = name ? `/api/instance/${name}` : '/api';
    return {
        tail: async () => {
            const response = await client.get(`${prefix}/log/tail`);
            return response.data;
        }
    };
};

const d = api();

export default {
    ...d,
    forInstance: (name) => api(name),
};
