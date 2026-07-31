import React, {useState, useEffect} from "react";
import TabTitle from "./TabTitle";

const TabControl = ({children, activeIndex}) => {
    const [selectedTab, setSelectedTab] = useState(0)

    useEffect(() => {
        if (activeIndex !== undefined && activeIndex !== selectedTab) {
            setSelectedTab(activeIndex);
        }
    }, [activeIndex]);

    const handleSelect = (index) => {
        setSelectedTab(index);
        const child = children[index];
        if (child && child.props.onActivate) {
            child.props.onActivate();
        }
    }

    return (
        <div className="mb-6">
            <div className="px-4 pt-3">
                {children.map((item, index) => (
                    <TabTitle
                        key={index}
                        title={item.props.title}
                        index={index}
                        isActive={index === selectedTab}
                        setSelectedTab={handleSelect}
                    />
                ))}
            </div>
            <div className="z-10 relative accentuated bg-gray-dark p-4">
                <div className="text-white rounded-sm bg-gray-medium shadow-inner px-6 pt-4 pb-6">
                    {children[selectedTab]}
                </div>
            </div>
        </div>
    )
}

export default TabControl