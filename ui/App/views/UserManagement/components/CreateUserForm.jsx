import {useForm} from "react-hook-form";
import React from "react";
import { useTranslation } from 'react-i18next';
import user from "../../../../api/resources/user";
import Button from "../../../components/Button";
import Label from "../../../components/Label";
import Input from "../../../components/Input";
import Error from "../../../components/Error";

const CreateUserForm = ({updateUserList}) => {
    const { t } = useTranslation('userManagement');
    const roleValue = "admin";

    const {
        register,
        handleSubmit,
        formState: {errors},
        watch
    } = useForm({
        values: {
            role: roleValue,
        }
    });
    const password = watch('password');

    const onSubmit = async (data) => {
        const res = await user.add(data);
        if (res) {
            updateUserList()
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-4">
                <Label htmlFor="username" text={t('username', { ns: 'common' })}/>
                <Input register={register('username', {required: true})}
                       type="text"
                       placeholder={t('username', { ns: 'common' })}
                />
                <Error error={errors.username} message={t('usernameRequired')}/>
            </div>
            <div className="mb-4">
                <Label htmlFor="role" text={t('role', { ns: 'common' })}/>
                <Input register={register('role', {required: true})}
                       value={roleValue}
                       disabled={true}
                       placeholder={t('role', { ns: 'common' })}
                />
                <Error error={errors.role} message={t('roleRequired')}/>
            </div>
            <div className="mb-4">
                <Label htmlFor="email" text={t('email', { ns: 'common' })}/>
                <Input register={register('email', {required: true})}
                       type="email"
                       placeholder={t('email', { ns: 'common' })}
                />
                <Error error={errors.email} message={t('emailRequired')}/>
            </div>
            <div className="mb-4">
                <Label htmlFor="password" text={t('password', { ns: 'common' })}/>
                <Input register={register('password', {required: true})}
                       type="password"
                       placeholder={t('password', { ns: 'common' })}
                />
                <Error error={errors.password} message={t('passwordRequired')}/>
            </div>
            <div className="mb-4">
                <Label htmlFor="password_confirmation" text={t('passwordConfirmation')}/>
                <Input register={register('password_confirmation', {
                            required: true,
                            validate: conformation => conformation === password
                        })}

                       type="password"
                       placeholder={t('passwordConfirmation')}
                />
                <Error error={errors.password_confirmation}
                       message={t('passwordMismatch')}/>
            </div>
            <Button isSubmit={true} type="success">{t('save', { ns: 'common' })}</Button>
        </form>
    )
}

export default CreateUserForm;
