/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import ErrorBoundary from "@components/ErrorBoundary";
import { findComponentByCodeLazy } from "@webpack";
import { Animations, ChannelRTCStore, useStateFromStores } from "@webpack/common";
import type { CSSProperties } from "react";

import { ExpandedGuildFolderStore, settings, SortedGuildStore } from ".";

const GuildsBar = findComponentByCodeLazy('("guildsnav")');

function getExpandedFolderIds() {
    const expandedFolders = ExpandedGuildFolderStore.getExpandedFolders();
    const folders = SortedGuildStore.getGuildFolders();

    const expandedFolderIds = new Set<string>();

    for (const folder of folders) {
        if (expandedFolders.has(folder.folderId) && folder.guildIds?.length) {
            expandedFolderIds.add(folder.folderId);
        }
    }

    return expandedFolderIds;
}

function getCustomImageStyle(): CSSProperties | null {
    if (!settings.store.customImage) return null;

    const fit = settings.store.customImageFit || "cover";

    return {
        backgroundImage: `url("${settings.store.customImage}")`,
        backgroundSize: fit === "fill" ? "100% 100%" : fit,
        backgroundRepeat: fit === "repeat" ? "repeat" : "no-repeat",
        backgroundPosition: "center",
        opacity: settings.store.customImageOpacity ?? 1
    };
}

export default ErrorBoundary.wrap(guildsBarProps => {
    const expandedFolderIds = useStateFromStores([ExpandedGuildFolderStore, SortedGuildStore], () => getExpandedFolderIds());
    const isFullscreen = useStateFromStores([ChannelRTCStore], () => ChannelRTCStore.isFullscreenInContext());

    const Sidebar = (
        <GuildsBar
            {...guildsBarProps}
            isBetterFolders={true}
            betterFoldersExpandedIds={expandedFolderIds}
        />
    );

    const visible = !!expandedFolderIds.size;
    const guilds = document.querySelector(guildsBarProps.className.split(" ").map(c => `.${c}`).join(""));
    const customImageStyle = getCustomImageStyle();

    // We need to display none if we are in fullscreen. Yes this seems horrible doing with css, but it's literally how Discord does it.
    // Also display flex otherwise to fix scrolling.
    const sidebarStyle = {
        display: isFullscreen ? "none" : "flex"
    } satisfies CSSProperties;

    const content = (
        <>
            {customImageStyle && <div className="vc-betterFolders-sidebar-bg" style={customImageStyle} />}
            <div className="vc-betterFolders-sidebar-content">{Sidebar}</div>
        </>
    );

    if (!guilds || !settings.store.sidebarAnim) {
        return visible
            ? <div className="vc-betterFolders-sidebar" style={sidebarStyle}>{content}</div>
            : null;
    }

    return (
        <Animations.Transition
            items={visible}
            from={{ width: 0 }}
            enter={{ width: guilds.getBoundingClientRect().width }}
            leave={{ width: 0 }}
            config={{ duration: 200 }}
        >
            {(animationStyle: any, show: any) =>
                show && (
                    <Animations.animated.div className="vc-betterFolders-sidebar" style={{ ...animationStyle, ...sidebarStyle }}>
                        {content}
                    </Animations.animated.div>
                )
            }
        </Animations.Transition>
    );
}, { noop: true });