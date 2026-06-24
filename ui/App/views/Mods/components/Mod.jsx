import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowCircleUp,
    faCheck,
    faSpinner,
    faTimes,
    faToggleOff,
    faToggleOn,
    faTrashAlt,
    faCaretDown,
    faCaretRight
} from "@fortawesome/free-solid-svg-icons";
import modsResource from "../../../../api/resources/mods";
import React, {useEffect, useState} from "react";
import {coerce, gt, satisfies} from "semver";

const Mod = ({mod, factorioVersion, toggleMod, deleteMod, updateMod, addUpdatableMod, disabled = false, visibleCols}) => {

    const [newVersion, setNewVersion] = useState(null)
    const [icon, setIcon] = useState(faArrowCircleUp)
    const [checked, setChecked] = useState(false)
    const [depsOpen, setDepsOpen] = useState(false)

    useEffect(() => {
        if (!disabled && !checked) {
            setChecked(true);
            (async () => {
                try {
                    const data = await modsResource.portal.info(mod.name)

                let newestRelease;
                data.releases.forEach(release => {
                    if (
                        gt(
                            coerce(release.version),
                            coerce(mod.version)
                        ) && (
                            satisfies(factorioVersion, "~" + coerce(release.info_json.factorio_version).version) ||
                            (
                                satisfies(factorioVersion, "1.0.0") &&
                                satisfies(coerce(release.info_json.factorio_version), "0.18.x")
                            )
                        )
                    ) {
                        if (!newestRelease) {
                            newestRelease = release;
                        } else if (gt(coerce(release.version).version, coerce(newestRelease.version).version)) {
                            newestRelease = release;
                        }
                    }
                });

                if (newestRelease && newestRelease.version !== mod.version) {
                    const installableVersion = {
                        downloadUrl: newestRelease.download_url,
                        fileName: newestRelease.file_name,
                        modName: mod.name
                    }
                    setNewVersion(installableVersion);
                    if (addUpdatableMod !== null) {
                        addUpdatableMod(installableVersion)
                    }
                } else {
                    setNewVersion(null);
                }

            } catch (e) {}
            })();
        }
    }, [mod]);

    const deps = mod.dependencies || [];
    const displayDeps = deps.filter(d => d && d.trim()).slice(0, 10);
    const vis = visibleCols || ['compatibility','enabled','name','version','factorio'];

    return (
        <tr className="py-1">
            {vis.includes('compatibility') && (
            <td className="pr-4">
                {mod.compatibility
                    ? <FontAwesomeIcon className="text-green" icon={faCheck}/>
                    : <FontAwesomeIcon className="text-red" icon={faTimes}/>
                }
            </td>
            )}
            {vis.includes('enabled') && (
            <td className="pr-4">
                {
                    disabled
                        ?

                        mod.enabled
                            ? <FontAwesomeIcon className="text-green" icon={faCheck}/>
                            : <FontAwesomeIcon className="text-red" icon={faTimes}/>
                        :
                        mod.enabled
                            ? <FontAwesomeIcon className="cursor-pointer hover:text-green-light text-green"
                                                icon={faToggleOn}
                                                onClick={() => toggleMod(mod.name)}/>
                            :
                            <FontAwesomeIcon className="cursor-pointer hover:text-red-light text-red"
                                              icon={faToggleOff}
                                              onClick={() => toggleMod(mod.name)}/>
                }
            </td>
            )}
            {vis.includes('name') && (
            <td className="pr-4">
                {mod.title}
                {displayDeps.length > 0 && (
                    <span className="ml-1 text-gray-light cursor-pointer select-none"
                          onClick={() => setDepsOpen(!depsOpen)}>
                        <FontAwesomeIcon icon={depsOpen ? faCaretDown : faCaretRight} className="mr-1 text-xs"/>
                        <span className="text-xs">{displayDeps.length}</span>
                    </span>
                )}
                {depsOpen && displayDeps.length > 0 && (
                    <div className="mt-1 pl-2 border-l-2 border-gray-dark text-xs text-gray-light">
                        {displayDeps.map((d, i) => (
                            <div key={i} className="whitespace-nowrap">{d}</div>
                        ))}
                        {deps.length > 10 && (
                            <div className="text-gray">... and {deps.length - 10} more</div>
                        )}
                    </div>
                )}
            </td>
            )}
            {vis.includes('version') && (
            <td className="pr-4">
                {mod.version}
                {!disabled && newVersion && <FontAwesomeIcon spin={icon === faSpinner}
                                                onClick={() => {
                                                    setIcon(faSpinner)
                                                    updateMod(newVersion)
                                                        .finally(() => setIcon(faArrowCircleUp))
                                                }}
                                                className="hover:text-orange cursor-pointer ml-1"
                                                icon={icon}/>}
            </td>
            )}
            {vis.includes('factorio') && (
            <td className="pr-4">{mod.dep_op ? mod.dep_op + ' ' + mod.factorio_version : mod.factorio_version}</td>
            )}
            {vis.includes('size') && (
            <td className="pr-4 text-gray-light text-sm">{mod.file_size > 0 ? ((mod.file_size / 1024).toFixed(0) + ' KB') : '-'}</td>
            )}
            {
                !disabled &&
                <td className="pr-4">
                    <FontAwesomeIcon className={"text-red cursor-pointer hover:text-red-light"}
                                     onClick={() => deleteMod(mod.name)} icon={faTrashAlt}/>
                </td>
            }
        </tr>
    )
}

export default Mod;
