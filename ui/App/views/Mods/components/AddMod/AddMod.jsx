import React from "react";
import AddModForm from "./components/AddModForm";
import FactorioLogin from "./components/FactorioLogin";

const AddMod = ({refetchInstalledMods, fuse, loading, isFactorioAuthenticated, setIsFactorioAuthenticated}) => {

    return isFactorioAuthenticated
        ? <AddModForm fuse={fuse} loading={loading} setIsFactorioAuthenticated={setIsFactorioAuthenticated} refetchInstalledMods={refetchInstalledMods}/>
        : <FactorioLogin setIsFactorioAuthenticated={setIsFactorioAuthenticated}/>
}

export default AddMod;
