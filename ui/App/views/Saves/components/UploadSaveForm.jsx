import Button from "../../../components/Button";
import React, {useState} from "react";
import { useTranslation } from 'react-i18next';
import {useForm} from "react-hook-form";
import Error from "../../../components/Error";


const UploadSaveForm = ({onSuccess, api}) => {
    const { t } = useTranslation('saves');
    const {register, handleSubmit, formState: {errors}} = useForm();
    const [fileName, setFileName] = useState(t('selectFile'));

    const onSubmit = (data, e) => {
        api.upload(data.savefile[0]).then(_ => {
            e.target.reset();
            onSuccess();
        })
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-6">
                <label className="block text-white text-sm font-bold mb-2" htmlFor="password">
                    {t('saveFile')}
                </label>
                <div className="relative bg-white shadow text-black w-full">
                    <input
                        className="absolute left-0 top-0 opacity-0 cursor-pointer w-full h-full"
                        {...register('savefile', {required: true})}
                        onChange={e => setFileName(e.currentTarget.files[0].name)}
                        type="file"/>
                    <div className="px-2 py-3">{fileName}</div>
                </div>
                <Error error={errors.savefile} message={t('saveNameRequired')}/>
            </div>
            <Button type="success" isSubmit={true}>{t('upload', { ns: 'common' })}</Button>
        </form>
    )
}

export default UploadSaveForm;
