import definePlugin from "@utils/types";
import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { Menu, UserStore, GuildMemberStore } from "@webpack/common";
import * as DataStore from "@api/DataStore";

const DATA_KEY = "HideUsernames_hiddenUsers";
const BLACK_AVATAR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let hiddenUsers = new Set<string>();
const originalData = new Map<string, { username: string; globalName: any; avatar: string | null; getAvatarURL?: Function }>();
let originalGetNick: typeof GuildMemberStore.getNick;

function applyHide(id: string) {
    const user = UserStore.getUser(id) as any;
    if (!user || originalData.has(id)) return;
    originalData.set(id, {
        username: user.username,
        globalName: user.globalName,
        avatar: user.avatar,
        getAvatarURL: user.getAvatarURL?.bind(user),
    });
    user.username = "Hidden User";
    user.globalName = "Hidden User";
    user.avatar = null;
    user.getAvatarURL = () => BLACK_AVATAR;
}

function applyReveal(id: string) {
    const user = UserStore.getUser(id) as any;
    const orig = originalData.get(id);
    if (user && orig) {
        user.username = orig.username;
        user.globalName = orig.globalName;
        user.avatar = orig.avatar;
        if (orig.getAvatarURL) user.getAvatarURL = orig.getAvatarURL;
        else delete user.getAvatarURL;
    }
    originalData.delete(id);
}

async function saveHiddenUsers() {
    await DataStore.set(DATA_KEY, Array.from(hiddenUsers));
}

async function toggleUser(id: string) {
    if (hiddenUsers.has(id)) {
        hiddenUsers.delete(id);
        applyReveal(id);
    } else {
        hiddenUsers.add(id);
        applyHide(id);
    }
    await saveHiddenUsers();
    UserStore.emitChange();
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string } }) => {
    if (!user) return;
    const isHidden = hiddenUsers.has(user.id);
    children.push(
        <Menu.MenuItem
            id="hide-username-toggle"
            label={isHidden ? "Reveal User" : "Hide User"}
            action={() => toggleUser(user.id)}
        />
    );
};

export default definePlugin({
    name: "HideUsernames",
    description: "Right-click a user to hide their username and avatar everywhere they appear, replacing them with \"Hidden User\" and a black avatar.",
    authors: [{ name: "YourName", id: 123456789012345678n }],

    flux: {
        USER_UPDATE() {
            for (const id of hiddenUsers) applyHide(id);
        },
    },

    async start() {
        const saved = await DataStore.get<string[]>(DATA_KEY);
        hiddenUsers = new Set(saved ?? []);

        originalGetNick = GuildMemberStore.getNick.bind(GuildMemberStore);
        (GuildMemberStore as any).getNick = (guildId: string, userId: string) => {
            if (hiddenUsers.has(userId)) return null;
            return originalGetNick(guildId, userId);
        };

        for (const id of hiddenUsers) applyHide(id);
        addContextMenuPatch("user-context", userContextPatch);
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        (GuildMemberStore as any).getNick = originalGetNick;
        for (const id of Array.from(hiddenUsers)) applyReveal(id);
    },
});