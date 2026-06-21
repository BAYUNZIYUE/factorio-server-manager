import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import Panel from "../components/Panel";
import Button from "../components/Button";
import server from "../../api/resources/server";
import socket from "../../api/socket";

const ServerVersion = ({serverStatus}) => {

    const { t } = useTranslation('serverVersion');
    const [currentVersion, setCurrentVersion] = useState(null);
    const [availableVersions, setAvailableVersions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installVersion, setInstallVersion] = useState(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const current = await server.version.current();
            setCurrentVersion(current.version);
        } catch (e) {
            setError(t('fetchFailed'));
        }
        try {
            const available = await server.version.available();
            setAvailableVersions(available || []);
        } catch (e) {
            setError(t('fetchFailed'));
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchData();

        const handleVersionMessage = (msg) => {
            try {
                const data = JSON.parse(typeof msg === 'string' ? msg : JSON.stringify(msg));
                if (data.type === 'download_progress') {
                    setProgress(data.percent);
                } else if (data.type === 'install_complete') {
                    setIsInstalling(false);
                    setProgress(0);
                    setCurrentVersion(data.version);
                    window.flash(t('installSuccess').replace('{version}', data.version), "green");
                }
            } catch (e) {}
        };

        socket.on('server_version', handleVersionMessage);
        return () => socket.off('server_version', handleVersionMessage);
    }, []);

    const handleInstall = async (version) => {
        if (serverStatus && serverStatus.running) {
            window.flash(t('serverMustBeStopped'), "red");
            return;
        }
        setInstallVersion(version);
        setIsInstalling(true);
        setProgress(0);
        setError(null);
        try {
            await server.version.install(version);
        } catch (e) {
            setError(t('installFailed').replace('{error}', e.message || ''));
            setIsInstalling(false);
        }
    };

    const hasUpdate = currentVersion && availableVersions.length > 0
        && availableVersions[0].version !== currentVersion;

    return (
        <Panel
            title={t('serverVersion')}
            content={
                <>
                    {isLoading ? (
                        <p className="text-gray-light">{t('checkingVersion')}</p>
                    ) : (
                        <>
                            <div className="mb-6">
                                <h2 className="text-dirty-white text-lg mb-2">{t('installedVersion')}</h2>
                                <div className="bg-black rounded p-4 border border-gray-light">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-dirty-white font-bold">{currentVersion || t('unknown', { ns: 'common' })}</span>
                                        </div>
                                        <div>
                                            {hasUpdate ? (
                                                <span className="text-orange text-sm">{t('updateAvailable')}</span>
                                            ) : (
                                                <span className="text-green text-sm">{t('upToDate')}</span>
                                            )}
                                        </div>
                                    </div>
                                    {isInstalling && (
                                        <div className="mt-3">
                                            <div className="w-full bg-gray-dark rounded h-2">
                                                <div
                                                    className="bg-orange h-2 rounded transition-all duration-300"
                                                    style={{width: `${progress}%`}}
                                                />
                                            </div>
                                            <p className="text-sm text-gray-light mt-1">
                                                {t('downloadProgress').replace('{percent}', progress)}
                                            </p>
                                        </div>
                                    )}
                                    {error && (
                                        <p className="text-red text-sm mt-2">{error}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h2 className="text-dirty-white text-lg mb-2">{t('availableVersions')}</h2>
                                <div className="bg-black rounded border border-gray-light">
                                    {availableVersions.length === 0 ? (
                                        <p className="p-4 text-gray-light">{t('noInternet')}</p>
                                    ) : (
                                        <div className="divide-y divide-gray-light">
                                            {availableVersions.map((release, i) => (
                                                <div key={release.version} className="flex items-center justify-between p-3">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-dirty-white">{release.version}</span>
                                                        {i === 0 && (
                                                            <span className="text-xs bg-green text-black px-1 rounded">{t('latest')}</span>
                                                        )}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        isLoading={isInstalling && installVersion === release.version}
                                                        isDisabled={isInstalling || currentVersion === release.version}
                                                        onClick={() => handleInstall(release.version)}
                                                    >
                                                        {currentVersion === release.version ? t('current') : t('install')}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {hasUpdate && !isInstalling && (
                                <div className="mt-4 text-center">
                                    <Button
                                        type="success"
                                        onClick={() => handleInstall(availableVersions[0].version)}
                                    >
                                        {t('updateTo').replace('{version}', availableVersions[0].version)}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </>
            }
        />
    )
};

export default ServerVersion;
