import React, {useEffect, useState} from "react";
import AddModForm from "./components/AddModForm";
import FactorioLogin from "./components/FactorioLogin";
import modResource from "../../../../../api/resources/mods";

const AddMod = ({refetchInstalledMods, fuse, loading}) => {

    const [isFactorioAuthenticated, setIsFactorioAuthenticated] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('fsm_portal_auth');
        if (saved === 'true') {
            setIsFactorioAuthenticated(true);
        }
        (async () => {
            const status = await modResource.portal.status();
            setIsFactorioAuthenticated(status);
            localStorage.setItem('fsm_portal_auth', status ? 'true' : '');
        })();
    }, []);

    return isFactorioAuthenticated
        ? <AddModForm fuse={fuse} loading={loading} setIsFactorioAuthenticated={setIsFactorioAuthenticated} refetchInstalledMods={refetchInstalledMods}/>
        : <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
}

export default AddMod;
