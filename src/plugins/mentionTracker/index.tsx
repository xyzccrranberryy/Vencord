import "./style.css";

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { 
    ModalCloseButton as _ModalCloseButton, 
    ModalContent as _ModalContent, 
    ModalHeader as _ModalHeader, 
    ModalRoot as _ModalRoot, 
    ModalSize, 
    openModal 
} from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildMemberStore, GuildStore, NavigationRouter, Text, UserStore } from "@webpack/common";
import { useSyncExternalStore } from "react";
import type React from "react";

// Type assertions to fix JSX element constructor/signature errors
const ModalRoot = _ModalRoot as unknown as React.ComponentType<any>;
const ModalHeader = _ModalHeader as unknown as React.ComponentType<any>;
const ModalCloseButton = _ModalCloseButton as unknown as React.ComponentType<any>;
const ModalContent = _ModalContent as unknown as React.ComponentType<any>;

interface MentionEntry {
    id: string;
    channelId: string;
    guildId: string | null;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    content: string;
    timestamp: number;
}

const DATA_KEY = "MentionTracker_entries";
let entries: MentionEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
    for (const cb of listeners) cb();
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function getSnapshot() {
    return entries;
}

async function persist() {
    await DataStore.set(DATA_KEY, entries);
}

async function loadEntries() {
    entries = (await DataStore.get<MentionEntry[]>(DATA_KEY)) ?? [];
}

async function addEntry(entry: MentionEntry) {
    if (entries.some(e => e.id === entry.id)) return;
    entries = [entry, ...entries].slice(0, settings.store.maxEntries || 100);
    notify();
    await persist();
}

async function clearEntries() {
    entries = [];
    notify();
    await persist();
}

async function removeEntry(id: string) {
    entries = entries.filter(e => e.id !== id);
    notify();
    await persist();
}

function jumpToMention(entry: MentionEntry) {
    NavigationRouter.transitionTo(`/channels/${entry.guildId ?? "@me"}/${entry.channelId}/${entry.id}`);
}

function getAvatarURL(id: string, avatar: string | null, size = 64) {
    if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=${size}`;
    const index = Number(BigInt(id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export const settings = definePluginSettings({
    trackRoleMentions: {
        type: OptionType.BOOLEAN,
        description: "Also track messages that mention a role you have",
        default: true
    },
    trackEveryoneHere: {
        type: OptionType.BOOLEAN,
        description: "Also track @everyone / @here mentions",
        default: false
    },
    maxEntries: {
        type: OptionType.SLIDER,
        description: "Maximum number of mentions to remember",
        markers: [25, 50, 100, 200, 300],
        default: 100,
        stickToMarkers: true
    }
});

function MentionPanel({ modalProps }: { modalProps: any }) {
    const list = useSyncExternalStore(subscribe, getSnapshot);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>Mention Tracker</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <div className="mt-toolbar">
                    <span className="mt-count">{list.length} mention{list.length === 1 ? "" : "s"}</span>
                    <button className="mt-clear" onClick={() => clearEntries()}>Clear all</button>
                </div>
                {list.length === 0 && (
                    <div className="mt-empty">No mentions tracked yet.</div>
                )}
                <div className="mt-list">
                    {list.map(entry => {
                        const channel = ChannelStore.getChannel(entry.channelId);
                        const guild = entry.guildId ? GuildStore.getGuild(entry.guildId) : null;
                        const location = guild
                            ? `${guild.name} #${channel?.name ?? "unknown"}`
                            : `DM: ${channel?.name || entry.authorName}`;

                        return (
                            <div
                                key={entry.id}
                                className="mt-entry"
                                onClick={() => {
                                    jumpToMention(entry);
                                    modalProps.onClose();
                                }}
                            >
                                <img className="mt-avatar" src={getAvatarURL(entry.authorId, entry.authorAvatar)} alt="" />
                                <div className="mt-entry-body">
                                    <div className="mt-entry-top">
                                        <span className="mt-author">{entry.authorName}</span>
                                        <span className="mt-location">{location}</span>
                                    </div>
                                    <div className="mt-content">{entry.content}</div>
                                    <div className="mt-time">{new Date(entry.timestamp).toLocaleString()}</div>
                                </div>
                                <button
                                    className="mt-remove"
                                    onClick={e => {
                                        e.stopPropagation();
                                        removeEntry(entry.id);
                                    }}
                                    title="Remove"
                                >×</button>
                            </div>
                        );
                    })}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

function openMentionPanel() {
    openModal(modalProps => <MentionPanel modalProps={modalProps} />);
}

export default definePlugin({
    name: "MentionTracker",
    description: "Keeps a running list of every message that mentions you, with one-click jump back to it.",
    authors: [{ name: "YourName", id: 123456789012345678n }],
    settings,

    toolboxActions: {
        "Open Mention Tracker": openMentionPanel
    },

    async start() {
        await loadEntries();
    },

    flux: {
        MESSAGE_CREATE({ message, optimistic }: any) {
            if (optimistic) return;
            if (!message?.author || !message?.id) return;

            const me = UserStore.getCurrentUser();
            if (!me || message.author.id === me.id) return;

            const channelId = message.channel_id ?? message.channelId;
            const channel = ChannelStore.getChannel(channelId);
            
            // Fixed guildId property check
            const guildId = channel?.guild_id ?? null;

            const directMention = Array.isArray(message.mentions) &&
                message.mentions.some((u: any) => u?.id === me.id);

            const everyoneMention = settings.store.trackEveryoneHere &&
                (message.mention_everyone ?? message.mentionEveryone ?? false);

            let roleMention = false;
            if (settings.store.trackRoleMentions && guildId) {
                const mentionRoles = message.mention_roles ?? message.mentionRoles ?? [];
                if (Array.isArray(mentionRoles) && mentionRoles.length) {
                    const member = GuildMemberStore.getMember(guildId, me.id);
                    if (member?.roles?.length) {
                        const myRoles = new Set(member.roles);
                        roleMention = mentionRoles.some((r: string) => myRoles.has(r));
                    }
                }
            }

            if (!directMention && !everyoneMention && !roleMention) return;

            const rawTimestamp = message.timestamp;
            const timestamp = rawTimestamp?.valueOf ? rawTimestamp.valueOf() : Date.now();

            addEntry({
                id: message.id,
                channelId,
                guildId,
                authorId: message.author.id,
                authorName: message.author.globalName ?? message.author.global_name ?? message.author.username,
                authorAvatar: message.author.avatar ?? null,
                content: (message.content || "[No text content]").slice(0, 200),
                timestamp
            });
        }
    },

    openMentionPanel
});