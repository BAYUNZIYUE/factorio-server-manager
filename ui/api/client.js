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
    if(err.response.status === 502) {
        if (window.flash) window.flash("Service not available", "red");
    } else if (err.response.status === 401) {
        if (window.location.pathname !== '/login') {
            window.location.replace('/login');
            return new Promise(() => {});
        }
    } else {
        if (window.flash) window.flash(err.response.data, "red");
    }
    return Promise.reject(err);
});

export default client;