import Platform from 'Platform';
import {saveChatMessages, onChatMessages, forEachChat} from './im-chats';
import ui from './im-ui';
import DelayAction from '../../utils/delay-action';
import {isMatchWindowCondition, updateNotice} from '../notice';
import Lang from '../../lang';
import profile from '../profile';
import members from '../members';

/**
 * 获取描述聊天消息内容的纯文本形式
 * @param {ChatMessage} chatMessage 聊天消息
 * @param {number} [limitLength=255] 限制内容最大长度
 * @param {booean} [ignoreBreak=true] 是否忽略换行
 * @return {string} 描述聊天消息内容的纯文本形式
 * @private
 */
const getPlainTextOfChatMessage = (chatMessage, limitLength = 255, ignoreBreak = true) => {
    if (chatMessage.isFileContent) {
        return `[${Lang.format('file.title.format', chatMessage.fileContent.name)}]`;
    }
    if (chatMessage.isImageContent) {
        return `[${Lang.string('file.image.title')}]`;
    }
    let plainText = chatMessage.renderedTextContent(ui.renderChatMessageContent).replace(/<(?:.|\n)*?>/gm, '');
    if (ignoreBreak) {
        plainText = plainText.trim().replace(/[\r\n]/g, ' ').replace(/\n[\s| | ]*\r/g, '\n');
    }
    if (limitLength && plainText.length > limitLength) {
        plainText = plainText.substr(0, limitLength);
    }
    return plainText;
};

/**
 * 记录最后一个通知的聊天
 * @private
 * @type {Chat}
 */
let lastNoticeChat = null;

/**
 * 记录最后一个通知的聊天通知信息
 * @private
 * @type {Object}
 */
let lastNoticeInfo = {};

/**
 * 更新聊天通知延迟操作实例
 * @type {DelayAction}
 * @private
 */
const updateChatNoticeTask = new DelayAction(() => {
    const {userConfig} = profile;
    if (!userConfig) {
        return;
    }

    let total = 0;
    let lastChatMessage = null;
    let notMuteCount = 0;

    forEachChat(chat => {
        if (chat.noticeCount) {
            const {isWindowFocus} = Platform.ui;
            const isActiveChat = ui.isActiveChat(chat.gid);
            if (isWindowFocus && isActiveChat) {
                const mutedMessages = chat.muteNotice();
                if (mutedMessages && mutedMessages.length) {
                    saveChatMessages(chat.messages, chat);
                }
            } else {
                total += chat.noticeCount;
                const chatLastMessage = chat.lastMessage;
                if (chatLastMessage && (!lastChatMessage || lastChatMessage.date < chatLastMessage.date)) {
                    lastChatMessage = chatLastMessage;
                    if (!chat.isMuteOrHidden) {
                        lastNoticeChat = chat;
                    }
                }
                if (!chat.isMuteOrHidden) {
                    notMuteCount += chat.noticeCount;
                }
            }
        }
    });

    let message = null;
    if (total && notMuteCount > 0 && lastNoticeInfo.notMuteCount < notMuteCount && lastNoticeInfo.total < total && userConfig.enableWindowNotification && (Platform.type === 'browser' || isMatchWindowCondition(userConfig.windowNotificationCondition))) {
        message = userConfig.safeWindowNotification ? {
            title: Lang.format('notification.receviedMessages.format', total),
        } : {
            title: lastNoticeChat.isOne2One ? Lang.format('notification.memberSays.format', lastChatMessage.getSender(members).displayName) : Lang.format('notification.memberSaysInGroup.format', lastChatMessage.getSender(members).displayName, lastNoticeChat.getDisplayName({members, user: profile.user})),
            body: getPlainTextOfChatMessage(lastChatMessage)
        };
        if (lastNoticeChat.isOne2One) {
            const theOtherOne = lastNoticeChat.getTheOtherOne({members, user: profile.user});
            const avatar = theOtherOne.getAvatar(profile.user && profile.user.server);
            if (avatar) {
                message.icon = avatar;
            }
        }
        message.click = () => {
            window.location.hash = `#/chats/recents/${lastNoticeChat.gid}`;
            if (Platform.ui.showAndFocusWindow) {
                Platform.ui.showAndFocusWindow();
            }
        };
    }

    let sound = false;
    if (
        total
        && notMuteCount > 0
        && lastNoticeInfo.total < total
        && lastNoticeInfo.notMuteCount < notMuteCount
        && userConfig.enableSound
        && (!userConfig.muteOnUserIsBusy || !profile.user.isBusy)
        && isMatchWindowCondition(userConfig.playSoundCondition)) {
        sound = true;
    }

    const tray = {label: total ? Lang.format('notification.receviedMessages.format', total) : ''};
    if (
        total
        && notMuteCount > 0
        && lastNoticeInfo.notMuteCount < notMuteCount
        && userConfig.flashTrayIcon
        && isMatchWindowCondition(userConfig.flashTrayIconCondition)
    ) {
        tray.flash = true;
    }

    lastNoticeInfo = {
        total, chats: total, message, sound, tray, notMuteCount,
    };
    updateNotice(lastNoticeInfo);
}, 200);

/**
 * 更新聊天通知
 * @return {void}
 */
export const updateChatNotice = () => {
    updateChatNoticeTask.do();
};

// 监听收到新消息事件，根据新收到的消息决定是否显示通知
onChatMessages(updateChatNotice);

// 监听界面窗口激活事件
if (Platform.ui.onWindowFocus) {
    Platform.ui.onWindowFocus(() => {
        const activedChat = ui.currentActiveChat;
        if (activedChat && activedChat.noticeCount) {
            activedChat.muteNotice();
            saveChatMessages(activedChat.messages, activedChat);
        }
    });
}

// 监听界面窗口还原事件
if (Platform.ui.onWindowRestore) {
    Platform.ui.onWindowRestore(() => {
        const activedChat = ui.currentActiveChat;
        if (lastNoticeChat && lastNoticeChat.noticeCount && (!activedChat || (!activedChat.noticeCount && activedChat.gid !== lastNoticeChat.gid))) {
            window.location.hash = `#/chats/recents/${lastNoticeChat.gid}`;
        }
    });
}

export default {
    updateChatNotice: updateChatNoticeTask.do
};
