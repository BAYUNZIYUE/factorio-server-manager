import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '../components/Panel';
import Button from '../components/Button';
import Input from '../components/Input';
import Error from '../components/Error';
import { useForm } from 'react-hook-form';

const InstanceCreate = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const { handleSubmit, register, formState: { errors }, watch } = useForm();

    const onSubmit = async (data) => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: data.name, display_name: data.display_name || data.name, game_port: parseInt(data.game_port) || 34197 })
            });
            if (res.ok) {
                const result = await res.json();
                navigate(`/instance/${result.name}`);
            } else {
                setError(await res.text());
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl text-dirty-white font-bold mb-6">Create Instance</h1>
            <div className="flex mb-6">
                <div className={`flex-1 text-center py-2 ${step === 1 ? 'bg-orange text-black' : 'bg-gray-dark text-gray-light'}`}>1. Configure</div>
                <div className={`flex-1 text-center py-2 ${step >= 2 ? 'bg-orange text-black' : 'bg-gray-dark text-gray-light'}`}>2. Confirm</div>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
                <Panel title={step === 1 ? 'Configure Instance' : 'Confirm Settings'}
                    content={step === 1 ? (
                        <div className="space-y-4">
                            <div>
                                <div className="font-bold text-sm mb-1">Name *</div>
                                <Input placeholder="my-server" register={register('name', { required: true, pattern: /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/, minLength: 1, maxLength: 64 })} />
                                <Error error={errors.name} message="Lowercase alphanumeric with hyphens (1-64 chars)" />
                            </div>
                            <div>
                                <div className="font-bold text-sm mb-1">Display Name</div>
                                <Input placeholder="My Server" register={register('display_name')} />
                            </div>
                            <div>
                                <div className="font-bold text-sm mb-1">Game Port</div>
                                <Input type="number" defaultValue="34197" min={1024} max={65535} register={register('game_port', { min: 1024, max: 65535 })} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 text-sm">
                            <div><span className="text-gray-light">Name:</span> <span className="text-dirty-white">{watch('name')}</span></div>
                            <div><span className="text-gray-light">Display Name:</span> <span className="text-dirty-white">{watch('display_name') || watch('name')}</span></div>
                            <div><span className="text-gray-light">Port:</span> <span className="text-dirty-white">{watch('game_port') || 34197}</span></div>
                            {error && <div className="text-red-light font-bold">{error}</div>}
                        </div>
                    )}
                    actions={step === 1 ? (
                        <Button type="success" onClick={() => setStep(2)}>Next</Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button type="default" onClick={() => setStep(1)}>Back</Button>
                            <Button isSubmit type="success" isLoading={creating}>Create</Button>
                        </div>
                    )}
                />
            </form>
        </div>
    );
};
export default InstanceCreate;
