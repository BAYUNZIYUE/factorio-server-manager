import client from "../client";

export default {
    list: async () => {
        const response = await client.get('/api/instances');
        return response.data;
    },
    get: async (name) => {
        const response = await client.get(`/api/instances/${name}`);
        return response.data;
    },
    create: async (data) => {
        const response = await client.post('/api/instances', data);
        return response.data;
    },
    delete: async (name) => {
        const response = await client.delete(`/api/instances/${name}`);
        return response.data;
    },
    repair: async (name) => {
        const response = await client.post('/api/instances/repair', { name });
        return response.data;
    },
    checkPort: async (port) => {
        const response = await client.post('/api/instances/check-port', { port });
        return response.data;
    },
    status: async (name) => {
        const response = await client.get(`/api/instance/${name}/status`);
        return response.data;
    },
    start: async (name) => {
        const response = await client.post(`/api/instance/${name}/start`);
        return response.data;
    },
    stop: async (name) => {
        const response = await client.post(`/api/instance/${name}/stop`);
        return response.data;
    },
    kill: async (name) => {
        const response = await client.post(`/api/instance/${name}/kill`);
        return response.data;
    }
};
