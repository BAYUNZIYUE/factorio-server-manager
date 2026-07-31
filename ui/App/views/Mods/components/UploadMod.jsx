import React, {useState} from "react";
import { useTranslation } from 'react-i18next';
import Button from "../../../components/Button";
import Label from "../../../components/Label";
import {useForm} from "react-hook-form";

const UploadMod = ({refetchInstalledMods, api}) => {

    const { t } = useTranslation('mods');
    const defaultFileText = t('selectModFile')
    const [fileName, setFileName] = useState(defaultFileText);
    const [uploadProgress, setUploadProgress] = useState({current: 0, total: 0});
    const {register, handleSubmit} = useForm();
    const [isUploading, setIsUploading] = useState(false);

    const onSubmit = async (data, e) => {
        const files = data.mod_file;
        if (!files || files.length === 0) return;
        
        setIsUploading(true);
        setUploadProgress({current: 0, total: files.length});

        for (let i = 0; i < files.length; i++) {
            try {
                await api.upload(files[i]);
            } catch (err) {}
            setUploadProgress({current: i + 1, total: files.length});
        }

        refetchInstalledMods();
        e.target.reset();
        setFileName(defaultFileText);
        setUploadProgress({current: 0, total: 0});
        setIsUploading(false);
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Label text={t('save', { ns: 'common' })} htmlFor="mod_file"/>
            <div className="relative bg-white shadow text-black h-full w-full mb-4">
                <input
                    {...register('mod_file')}
                    className="absolute left-0 top-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={e => {
                        const count = e.currentTarget.files.length;
                        setFileName(count > 1 ? count + ' files selected' : e.currentTarget.files[0]?.name || defaultFileText);
                    }}
                    id="mod_file"
                    type="file"
                    multiple
                    accept="application/zip,.zip,.dat,.json"
                />
                <div className="px-2 py-2">{fileName}</div>
            </div>
            {uploadProgress.total > 1 && (
                <div className="mb-4">
                    <div className="w-full bg-gray-dark rounded h-2">
                        <div
                            className="bg-orange h-2 rounded transition-all duration-300"
                            style={{width: (uploadProgress.current / uploadProgress.total * 100) + '%'}}
                        />
                    </div>
                    <p className="text-sm text-gray-light mt-1">{uploadProgress.current}/{uploadProgress.total}</p>
                </div>
            )}
            <Button isLoading={isUploading} isSubmit={true}>
                {isUploading && uploadProgress.total > 0
                    ? t('upload', { ns: 'common' }) + ' (' + uploadProgress.current + '/' + uploadProgress.total + ')'
                    : t('upload', { ns: 'common' })}
            </Button>
        </form>
    )
}

export default UploadMod;
