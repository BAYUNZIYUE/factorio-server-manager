import React, {useEffect, useState} from "react";
import AddModForm from "./components/AddModForm";
import FactorioLogin from "./components/FactorioLogin";
import modResource from "../../../../../api/resources/mods";
import Fuse from "fuse.js";

const AddMod = ({refetchInstalledMods, fuse, setFuse}) => {

    const [isFactorioAuthenticated, setIsFactorioAuthenticated] = useState(false);

    useEffect(() => {
        (async () => {
            setIsFactorioAuthenticated(await modResource.portal.status())
        })();
        if (!fuse) {
            modResource.portal.list().then(res => {
                setFuse(new Fuse(res.results, {
                    keys: [{name: "name", weight: 2}, {name: "title", weight: 1}],
                    minMatchCharLength: 3
                }));
            });
        }
    }, []);

    return isFactorioAuthenticated
        ? <AddModForm fuse={fuse} setIsFactorioAuthenticated={setIsFactorioAuthenticated} refetchInstalledMods={refetchInstalledMods}/>
        : <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
}

export default AddMod;
