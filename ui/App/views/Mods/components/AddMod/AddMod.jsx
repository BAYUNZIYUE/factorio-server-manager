import React, {useEffect, useState} from "react";
import AddModForm from "./components/AddModForm";
import FactorioLogin from "./components/FactorioLogin";
import modResource from "../../../../../api/resources/mods";

const AddMod = ({refetchInstalledMods, fuse, loading}) => {

    const [isFactorioAuthenticated, setIsFactorioAuthenticated] = useState(false);

    useEffect(() => {
        (async () => {
            setIsFactorioAuthenticated(await modResource.portal.status())
        })();
    }, []);

    return isFactorioAuthenticated
        ? <AddModForm fuse={fuse} loading={loading} setIsFactorioAuthenticated={setIsFactorioAuthenticated} refetchInstalledMods={refetchInstalledMods}/>
        : <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
}

export default AddMod;
