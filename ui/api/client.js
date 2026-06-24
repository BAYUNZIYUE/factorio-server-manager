import Axios from "axios";

const client = Axios.create({
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

client.interceptors.response.use(res => res, err => {
    if (!err.response) {
        if (window.flash) window.flash("Network error or request timeout", "red");
        return Promise.reject(err);
    }
    const status = err.response.status;
    if (status === 502) {
        if (window.flash) window.flash("Service not available", "red");
    } else if (status === 401) {
        if (window.location.pathname !== '/login') {
            window.location.replace('/login');
            return new Promise(() => {});
        }
    } else if (status === 404) {
        // 404 is expected for portal "mod not found" — don't flash
    } else {
        if (window.flash) {
            const data = err.response.data;
            const msg = typeof data === 'string' ? data
                : (data && data.message) ? data.message
                : JSON.stringify(data || '');
            window.flash(msg, "red");
        }
    }
    return Promise.reject(err);
});

export default client;