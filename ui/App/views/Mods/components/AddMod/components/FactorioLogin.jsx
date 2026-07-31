import React, {useState} from "react";
import {useForm} from "react-hook-form";
import Input from "../../../../../components/Input";
import Label from "../../../../../components/Label";
import Button from "../../../../../components/Button";
import modsResource from "../../../../../../api/resources/mods";

const FactorioLogin = ({setIsFactorioAuthenticated}) => {

    const {register, handleSubmit} = useForm();
    const [isLoading, setIsLoading] = useState(false);

    const login = ({username, token}) => {
        setIsLoading(true);
        modsResource.portal.login(username, token)
            .then(res => {
                setIsFactorioAuthenticated(true)
            })
            .catch(() => window.flash("Given username or email and password do not match any account.", "red"))
            .finally(() => setIsLoading(false));
    }

    return (
        <form onSubmit={handleSubmit(login)}>
            <div className="flex mb-4">
                <div className="w-1/2 mr-2">
                    <Label text="Username" htmlFor="username"/>
                    <Input register={register('username',{required: true})}/>
                </div>
                <div className="w-1/2 ml-2">
                    <Label text="Token" htmlFor="password"/>
                    <Input type="password" register={register('token',{required: true})}/>
                </div>
            </div>
            <Button isSubmit={true} isLoading={isLoading}>Login</Button>
        </form>
    )
}

export default FactorioLogin;
