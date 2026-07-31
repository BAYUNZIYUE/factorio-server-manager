import React, {useState} from 'react';
import { useTranslation } from 'react-i18next';
import Modal from "./Modal";
import Button from "./Button";

function ConfirmDialog({title, content, isOpen, close, onSuccess, closeImmediately}) {

    const { t } = useTranslation('common');
    const [isLoading, setIsLoading] = useState(false);

    const confirm = () => {
        setIsLoading(true);
        if (closeImmediately) {
            close();
            onSuccess?.();
        } else {
            onSuccess()
                .finally(() => {
                    close();
                    setIsLoading(false);
                })
        }
    }

    return (
        <Modal
            title={title}
            content={content}
            isOpen={isOpen}
            actions={
                <>
                    <Button size="sm" onClick={close}>{t('cancel')}</Button>
                    <Button size="sm" isLoading={isLoading} type="success" onClick={confirm}>{t('confirm')}</Button>
                </>
            }
        />
    );
}

export default ConfirmDialog;