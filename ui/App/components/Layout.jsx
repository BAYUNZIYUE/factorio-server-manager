import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {NavLink, Outlet} from "react-router-dom";
import Button from "./Button";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBars} from "@fortawesome/free-solid-svg-icons";
import {Flash} from "./Flash";

const Layout = ({handleLogout, serverStatus}) => {

    const { t } = useTranslation(['layout', 'common', 'controls']);
    const [isNavCollapsed, setIsNavCollapsed] = useState(true);

    const Status = ({info}) => {

        let text = t('UNKNOWN', { ns: 'controls' });
        let color = 'gray-light';

        if (info && info.running) {
            text = t('RUNNING', { ns: 'controls' });
            color = 'green';
        } else if (info && !info.running) {
            text = t('STOPPED', { ns: 'controls' });
            color = 'red';
        }

        return (
            <div className={`bg-${color} accentuated rounded px-2 py-1 text-black`}>{text}</div>
        )
    }

    const Link = ({children, to, last}) => {
        return (
            <NavLink
                onClick={() => setIsNavCollapsed(true)}
                end
                to={to}
                className={({isActive}) => {
                    return [
                        isActive ? "bg-orange" : "",
                        `hover:glow-orange accentuated bg-gray-light hover:bg-orange text-black font-bold py-2 px-4 w-full block${last ? '' : ' mb-1'}`,
                    ].join(" ")
                }}
            >{children}</NavLink>)
    }

    return (
        <>
            {/*Sidebar*/}
            <div className="w-full md:w-88 md:fixed md:top-0 md:left-0 bg-gray-dark md:h-screen overflow-y-auto">
                <div className="py-4 px-2 accentuated">
                    <div className="mx-4 justify-between flex text-center">
                        <span className="text-dirty-white text-xl">{t('appTitle', { ns: 'layout' })}</span>
                        <button
                            className="md:hidden cursor-pointer text-white hover:text-dirty-white"
                            onClick={() => setIsNavCollapsed(!isNavCollapsed)}
                        >
                            <FontAwesomeIcon icon={faBars}/>
                        </button>
                    </div>
                </div>
                <div className={isNavCollapsed ? "hidden md:block" : "block"}>
                    <div className="py-4 px-2 accentuated">
                        <h1 className="text-dirty-white text-lg mb-2 mx-4">{t('serverStatus', { ns: 'layout' })}</h1>
                        <div className="mx-4 mb-4 text-center">
                            <Status info={serverStatus}/>
                        </div>
                    </div>
                    <div className="py-4 px-2 accentuated">
                        <h1 className="text-dirty-white text-lg mb-2 mx-4">{t('serverManagement', { ns: 'layout' })}</h1>
                        <div className="text-white text-center rounded-sm bg-black shadow-inner mx-4 p-1">
                            <Link to="/">{t('linkControls', { ns: 'layout' })}</Link>
                            <Link to="/saves">{t('linkSaves', { ns: 'layout' })}</Link>
                            <Link to="/mods">{t('linkMods', { ns: 'layout' })}</Link>
                            <Link to="/server-settings">{t('linkServerSettings', { ns: 'layout' })}</Link>
                            <Link to="/game-settings">{t('linkGameSettings', { ns: 'layout' })}</Link>
                            <Link to="/console">{t('linkConsole', { ns: 'layout' })}</Link>
                            <Link to="/logs" last={true}>{t('linkLogs', { ns: 'layout' })}</Link>
                        </div>
                    </div>
                    <div className="py-4 px-2 accentuated">
                        <h1 className="text-dirty-white text-lg mb-2 mx-4">{t('fsmAdministration', { ns: 'layout' })}</h1>
                        <div className="text-white text-center rounded-sm bg-black shadow-inner mx-4 p-1">
                            <Link to="/user-management">{t('linkUsers', { ns: 'layout' })}</Link>
                            <Link to="/help" last={true}>{t('linkHelp', { ns: 'layout' })}</Link>
                        </div>
                        <div className="mt-4 mx-4">
                            <label className="text-dirty-white text-sm block mb-1">{t('languageLabel', { ns: 'layout' })}</label>
                            <select
                                className="w-full bg-gray-dark text-white border border-gray-light rounded px-2 py-1 text-sm"
                                value={i18n.language}
                                onChange={(e) => { i18n.changeLanguage(e.target.value); }}
                            >
                                <option value="en">English</option>
                                <option value="zh-CN">简体中文</option>
                            </select>
                        </div>
                    </div>
                    <div className="py-4 px-2 accentuated">
                        <div className="text-white text-center rounded-sm bg-black shadow-inner mx-4 p-1">
                            <Button type="danger" className="w-full" onClick={handleLogout}>{t('logout', { ns: 'common' })}</Button>
                        </div>
                    </div>
                    <div className="accentuated-t accentuated-x md:block hidden"/>
                </div>
            </div>

            {/*Main*/}
            <div className="md:ml-88 min-h-screen">
                <div className="container md:mx-auto pt-16 md:px-6">
                    <Outlet />
                    <Flash/>
                </div>
            </div>
        </>
    );
}

export default Layout;