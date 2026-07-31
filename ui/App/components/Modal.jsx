import React from "react";
import * as ReactDom from "react-dom";

const modalRoot = document.getElementById('modal-root');

const Modal = ({title, content, isOpen, actions = null}) => {

    return ReactDom.createPortal((isOpen &&
        <div className="relative z-40">
            <div className="bg-black bg-opacity-75 fixed top-0 left-0 z-10 w-full min-h-screen flex items-center justify-center">
                <div className="w-11/12 md:w-1/2 lg:w-1/3 accentuated rounded-sm bg-gray-dark shadow-xl pb-4">
                    <div className="px-4 py-2 text-xl text-dirty-white font-bold">{title}</div>
                    <div className="text-white rounded-sm bg-gray-medium shadow-inner mx-4 px-6 pt-4 pb-6">
                        {content}
                    </div>
                    {actions && <div className="mx-4 pt-4 flex justify-between">{actions}</div>}
                </div>
            </div>
        </div>), modalRoot)
}

export default Modal;
