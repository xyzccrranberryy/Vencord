import definePlugin from "@utils/types";
import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { Alerts, Menu, RestAPI } from "@webpack/common";

interface RPCApplication {
    id: string;
    name: string;
    icon: string | null;
    owner?: {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
    };
    team?: {
        id: string;
        name: string;
        icon: string | null;
    };
}

function getAvatarURL(id: string, avatar: string | null | undefined, size = 128) {
    if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=${size}`;
    const index = Number(BigInt(id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function getTeamIconURL(teamId: string, icon: string | null, size = 128) {
    if (!icon) return null;
    return `https://cdn.discordapp.com/team-icons/${teamId}/${icon}.png?size=${size}`;
}

async function showOwner(botId: string, botName: string) {
    let app: RPCApplication;
    try {
        const res = await RestAPI.get({ url: `/applications/${botId}/rpc` });
        app = res.body;
    } catch (e) {
        Alerts.show({
            title: "Application Owner",
            body: `Couldn't fetch owner info for ${botName}. Discord may be hiding this, or it isn't a public application.`
        });
        return;
    }

    if (app.owner) {
        const { id, username, discriminator, avatar } = app.owner;
        const tag = discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username;
        Alerts.show({
            title: "Application Owner",
            body: (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <img
                        src={getAvatarURL(id, avatar)}
                        alt=""
                        width={64}
                        height={64}
                        style={{ borderRadius: "50%" }}
                    />
                    <div>
                        <div style={{ fontWeight: "bold", fontSize: "16px" }}>{tag}</div>
                        <div style={{ opacity: 0.7, fontSize: "12px" }}>ID: {id}</div>
                    </div>
                </div>
            )
        });
        return;
    }

    if (app.team) {
        const iconUrl = getTeamIconURL(app.team.id, app.team.icon);
        Alerts.show({
            title: "Application Owner",
            body: (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {iconUrl && (
                        <img
                            src={iconUrl}
                            alt=""
                            width={64}
                            height={64}
                            style={{ borderRadius: "50%" }}
                        />
                    )}
                    <div>
                        <div style={{ fontWeight: "bold", fontSize: "16px" }}>{app.team.name}</div>
                        <div style={{ opacity: 0.7, fontSize: "12px" }}>Owned by a team</div>
                    </div>
                </div>
            )
        });
        return;
    }

    Alerts.show({
        title: "Application Owner",
        body: `${botName}'s owner info isn't available.`
    });
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string; bot?: boolean; username?: string } }) => {
    if (!user?.bot) return;

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="view-application-owner"
                label="View Owner"
                action={() => showOwner(user.id, user.username ?? "This application")}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "ApplicationOwner",
    description: "Adds a 'View Owner' option to bot/app context menus to see who owns them.",
    authors: [{ name: "YourName", id: 123456789012345678n }],

    start() {
        // Triggers when right-clicking the bot in chat or the member list
        addContextMenuPatch("user-context", userContextPatch);
        
        // Triggers when clicking the three dots in the user profile popout
        addContextMenuPatch("user-profile-actions", userContextPatch);
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("user-profile-actions", userContextPatch);
    },
});