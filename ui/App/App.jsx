import React, {useCallback, useState} from 'react';
import user from "../api/resources/user";
import Login from "./views/Login";
import {Navigate, Route, Routes} from "react-router";
import Controls from "./views/Controls";
import {BrowserRouter, Outlet} from "react-router-dom";
import Logs from "./views/Logs";
import Saves from "./views/Saves/Saves";
import Layout from "./components/Layout";
import Mods from "./views/Mods/Mods";
import UserManagement from "./views/UserManagement/UserManagment";
import ServerSettings from "./views/ServerSettings";
import Console from "./views/Console";
import Help from "./views/Help";
import ServerVersion from "./views/ServerVersion";
import EventLog from "./views/EventLog";
import InstanceList from "./views/InstanceList";
import InstanceCreate from "./views/InstanceCreate";
import JobProgress from "./components/JobProgress";
import ModPackPage from "./views/ModPackPage";
import {InstanceProvider} from "./context/InstanceProvider";
import {Flash} from "./components/Flash";
import "./i18n";

const Placeholder = ({title}) => (
    <div className="text-center py-16">
        <h1 className="text-2xl text-dirty-white font-bold mb-4">{title || 'Coming Soon'}</h1>
        <p className="text-gray-light">This feature is under development.</p>
    </div>
);

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const handleAuthenticationStatus = useCallback(async (status) => {
        if (status?.username) setIsAuthenticated(true);
    }, []);

    const handleLogout = useCallback(async () => {
        const loggedOut = await user.logout();
        if (loggedOut) setIsAuthenticated(false);
    }, []);

    const ProtectedRoute = ({isAuthenticated}) => {
        if (!isAuthenticated) return <Navigate to="/login" state={{from: window.location.pathname}} />;
        return <Outlet/>;
    };

    return (
        <BrowserRouter>
            <Routes>
                <Route path="login" element={<Login handleLogin={handleAuthenticationStatus}/>}/>
                <Route element={<ProtectedRoute isAuthenticated={isAuthenticated}/>}>
                    <Route element={<Layout handleLogout={handleLogout}/>}>
                        <Route path="instances" element={<InstanceList/>}/>
                        <Route path="instances/create" element={<InstanceCreate/>}/>
                        <Route path="instances/import-save" element={<Placeholder title="Import from Save"/>}/>
                        <Route path="instances/modpacks" element={<ModPackPage/>}/>
                    </Route>
                    <Route path="instance/:name" element={<InstanceProvider><Layout handleLogout={handleLogout}/></InstanceProvider>}>
                        <Route index element={<Controls/>}/>
                        <Route path="saves" element={<Saves/>}/>
                        <Route path="mods" element={<Mods/>}/>
                        <Route path="server-settings" element={<ServerSettings/>}/>
                        <Route path="console" element={<Console/>}/>
                        <Route path="logs" element={<Logs/>}/>
                        <Route path="server-version" element={<ServerVersion/>}/>
                        <Route path="event-log" element={<EventLog/>}/>
                    </Route>
                    <Route element={<Layout handleLogout={handleLogout}/>}>
                        <Route path="user-management" element={<UserManagement/>}/>
                        <Route path="help" element={<Help/>}/>
                    </Route>
                    <Route index element={<Navigate to="/instances" replace/>}/>
                </Route>
            </Routes>
            <JobProgress/>
        </BrowserRouter>
    );
};
export default App;
