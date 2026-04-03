import { db, UserModel } from 'hydrooj';
import { deleteUserCache } from 'hydrooj/src/model/user';

const collbd = db.collection('badge');
const collubd = db.collection('user.badge');

interface UserBadge {
    _id: ObjectId;
    owner: number;
    badgeId: number;
    getAt: Date;
}

interface Badge {
    _id: number;
    short: string;
    title: string;
    backgroundColor: string;
    fontColor: string;
    content: string;
    users: number[];
    createAt: Date;
}

declare module 'hydrooj' {
    interface Model {
        userBadge: typeof UserBadgeModel;
        badge: typeof BadgeModel;
    }
    interface Collections {
        userBadge: UserBadge;
        badge: Badge;
    }
}

class UserBadgeModel {
    static coll = collubd;

    static async batchAdd(userIds: number[], badgeId: number): Promise<void> {
        if (userIds.length === 0) return;
        await UserBadgeModel.coll.insertMany(
            userIds.map(uid => ({
                owner: uid,
                badgeId: badgeId,
                getAt: new Date()
            }))
        );
    }

    static async batchDel(userIds: number[], badgeId: number): Promise<void> {
        if (userIds.length === 0) return;
        await UserBadgeModel.coll.deleteMany({
            owner: { $in: userIds },
            badgeId: badgeId
        });
        const clearResult = await UserModel.coll.updateMany(
            { _id: { $in: userIds }, badgeId },
            { $unset: { badgeId: '', badge: '' } }
        );
        // 清除缓存
        if (clearResult.modifiedCount > 0) {
            await deleteUserCache(true);
        }
    }

    static async getMulti(userId: number) {
        return await UserBadgeModel.coll.find({ owner: userId }).sort({ badgeId: 1 });
    }

    static async sel(userId: number, badgeId: number): Promise<number> {
        const userBadgeId = await UserBadgeModel.coll.findOne({ owner: userId, badgeId: badgeId });
        if (userBadgeId) {
            const badge: Badge = await BadgeModel.coll.findOne({ _id: badgeId });
            if (!badge) return 0;  // 空值检查
            const badgeid: number = badge._id;
            const payload: string = `${badge.short}${badge.backgroundColor}${badge.fontColor}#${badge.title}`;
            return await UserBadgeModel.setUserBadge(userId, badgeid, payload);
        } else {
            return 0;
        }
    }

    static async setUserBadge(userId: number, badgeId: number, badge: string): Promise<any> {
        return await UserModel.setById(userId, { badgeId: badgeId, badge: badge });
    }

    static async unsetUserBadge(userId: number): Promise<void> {
        await UserModel.setById(userId, undefined, { badgeId: '', badge: '' });
    }
}

class BadgeModel {
    static coll = collbd;

    static async getMulti() {
        return await BadgeModel.coll.find({}).sort({ _id: 1 });
    }

    static async add(short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: number[], badgeId?: number): Promise<number> {
        if (typeof badgeId !== 'number') {
            const [badge] = await BadgeModel.coll.find({}).sort({ _id: -1 }).limit(1).toArray();
            badgeId = Math.max((badge?._id || 0) + 1, 1);
        };
        const result = await BadgeModel.coll.insertOne({
            _id: badgeId,
            short,
            title,
            backgroundColor,
            fontColor,
            content,
            users,
            createAt: new Date()
        });
        if (users && users.length > 0) {
            await  UserBadgeModel.batchAdd(users, badgeId);
        }
        return badgeId;
    }

    static async get(badgeId: number): Promise<Badge | null> {
        return await BadgeModel.coll.findOne({ _id: badgeId });
    }

    static async getMultiByIds(badgeIds: number[]): Promise<Badge[]> {
        if (badgeIds.length === 0) return [];
        const badges = await BadgeModel.coll.find({ _id: { $in: badgeIds } }).toArray();
        return badges;
    }

    static async edit(badgeId: number, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: number[], users_old: number[]): Promise<number> {
        const result = await BadgeModel.coll.updateOne({ _id: badgeId }, { $set: { short, title, backgroundColor, fontColor, content, users } });

        const oldSet = users_old ? new Set(users_old) : new Set();
        const newSet = users ? new Set(users) : new Set();

        const toDelete = users_old?.filter(uid => !newSet.has(uid)) || [];
        const toAdd = users?.filter(uid => !oldSet.has(uid)) || [];

        await Promise.all([
            UserBadgeModel.batchDel(toDelete, badgeId),
            UserBadgeModel.batchAdd(toAdd, badgeId)
        ]);

        const badgeStr = `${short}${backgroundColor}${fontColor}#${title}`;
        await BadgeModel.resetBadge(badgeId, badgeStr);

        return result.modifiedCount;
    }

    static async del(badgeId: number): Promise<number> {
        const result = await BadgeModel.coll.deleteOne({ _id: badgeId });
        await UserBadgeModel.coll.deleteMany({ badgeId: badgeId });
        await BadgeModel.unsetBadge(badgeId);
        return result.deletedCount;
    }

    static async resetBadge(badgeId: number, badge: string): Promise<number> {
        const result = (await UserModel.coll.updateMany({ badgeId }, { $set: { badge } })).modifiedCount;
        if (result) {
            await deleteUserCache(true);
        }
        return result;
    }

    static async unsetBadge(badgeId: number): Promise<number> {
        const result = (await UserModel.coll.updateMany({ badgeId }, { $unset: { badgeId: '', badge: '' } })).modifiedCount;
        if (result) {
            await deleteUserCache(true);
        }
        return result;
    }
}

global.Hydro.model.userBadge = UserBadgeModel;
global.Hydro.model.badge = BadgeModel;

export { UserBadgeModel, BadgeModel, UserBadge, Badge };