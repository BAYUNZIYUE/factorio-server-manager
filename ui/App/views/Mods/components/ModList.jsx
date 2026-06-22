import Mod from "./Mod";
import React from "react";
import { useTranslation } from 'react-i18next';

const ModList = ({mods, factorioVersion, updateMod, toggleMod, deleteMod, addUpdatableMod = null, disabled = false}) => {

    const { t } = useTranslation('mods');

    return (
        <table className="w-full">
            <thead>
            <tr className="text-left py-1">
                <th>{t('name', { ns: 'common' })}</th>
                <th>{t('enabled', { ns: 'common' })}</th>
                <th>{t('compatibility')}</th>
                <th>{t('modVersion')}</th>
                <th>{t('factorioVersion')}</th>
                <th>{t('size', { ns: 'common' })}</th>
                <th/>
            </tr>
            </thead>
            <tbody>
            {
                factorioVersion !== null && mods.map(
                    (mod, i) =>
                        <Mod mod={mod} key={i}
                             updateMod={updateMod}
                             toggleMod={toggleMod}
                             deleteMod={deleteMod}
                             addUpdatableMod={addUpdatableMod}
                             factorioVersion={factorioVersion}
                             disabled={disabled}
                        />
                )
            }
            </tbody>
        </table>
    )
}

export default ModList;