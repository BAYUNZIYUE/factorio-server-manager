import {useForm} from "react-hook-form";
import { useTranslation } from 'react-i18next';
import Button from "../../../components/Button";
import React, {useState} from "react";
import Label from "../../../components/Label";
import Input from "../../../components/Input";
import Error from "../../../components/Error";

const CreateSaveForm = ({onSuccess, api}) => {
    const { t } = useTranslation('saves');
    const {register, handleSubmit, formState: {errors}} = useForm();
    const [isLoading, setIsLoading] = useState(false);

    const onSubmit = async (data, e) => {
        setIsLoading(true)
        api.create(data.savefile)
            .then(() => {
                e.target.reset();
                onSuccess();
            })
            .finally(() => setIsLoading(false))
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-6">
                <Label text={t('savefileName')} htmlFor="savefile"/>
                <Input register={register('savefile', {required: true})}/>
                <Error error={errors.savefile} message={t('saveNameRequired')}/>
            </div>
            <Button type="success" isLoading={isLoading} isSubmit={true}>{t('createSave')}</Button>
        </form>
    )
}

export default CreateSaveForm;
