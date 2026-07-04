import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import savesResource from "../../../api/resources/saves";
import Panel from "../../components/Panel";
import CreateSaveForm from "./components/CreateSaveForm";
import UploadSaveForm from "./components/UploadSaveForm";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faTrashAlt} from "@fortawesome/free-solid-svg-icons";
import { useInstance } from '../../context/InstanceProvider';

const Saves = () => {
    const { name } = useParams();
    const savesApi = savesResource.forInstance(name);
    const { instanceStatus } = useInstance();
    const serverStatus = instanceStatus || {};

    const { t } = useTranslation('saves');

    const [saves, setSaves] = useState([]);

    const updateList = () => {
        savesApi.list()
            .then(res => {
                if (res) {
                    setSaves(res);
                }
            })

    }

    useEffect(() => {
        updateList()
    }, []);

    const deleteSave = async (save) => {
        const res = await savesApi.delete(save);
        if (res) {
            updateList()
        }
    }

    return (
        <>
            <div className="lg:flex mb-6">
                <Panel
                    title={t('createSave')}
                    className="lg:w-1/2 lg:mr-3 mb-6 lg:mb-0"
                    content={
                        serverStatus.running
                            ? <p className="text-red-light pt-4 pb-24">
                                {t('createSaveDisabled')}
                            </p>
                            : <CreateSaveForm onSuccess={updateList} api={savesApi}/>
                    }
                />
                <Panel
                    title={t('uploadSave')}
                    className="lg:w-1/2 lg:ml-3"
                    content={<UploadSaveForm onSuccess={updateList} api={savesApi}/>}
                />
            </div>

            <Panel
                className="mb-4"
                title={t('saves')}
                content={
                    <div className="overflow-x-auto w-full">
                        <table className="w-full">
                            <thead>
                            <tr className="text-left py-1">
                                <th>{t('name', { ns: 'common' })}</th>
                                <th>{t('lastModifiedAt', { ns: 'common' })}</th>
                                <th>{t('size', { ns: 'common' })}</th>
                                <th>{t('actions', { ns: 'common' })}</th>
                            </tr>
                            </thead>
                            <tbody>
                            {saves.map(save =>
                                <tr className="py-2 md:py-1" key={save.name}>
                                    <td className="pr-4">{save.name}</td>
                                    <td className="pr-4">{(new Date(save.last_mod)).toLocaleString()}</td>
                                    <td className="pr-4">{parseFloat(save.size / 1024 / 1024).toFixed(3)} MB</td>
                                    <td>
                                        <a href={`/api/saves/dl/${save.name}`} className="mr-2">
                                            <FontAwesomeIcon
                                                className="text-gray-light cursor-pointer hover:text-orange"
                                                icon={faDownload}/>
                                        </a>
                                        <FontAwesomeIcon className="text-red cursor-pointer hover:text-red-light mr-2"
                                                         onClick={() => deleteSave(save)} icon={faTrashAlt}/>
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                }
            />
        </>
    )
}

export default Saves;
