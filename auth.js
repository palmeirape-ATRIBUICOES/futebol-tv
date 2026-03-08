// ===== AUTH MODULE — FUTEBOL TV =====
const AuthModule = {
    currentUser: null,
    userData: null,

    init() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                AuthModule.currentUser = user;
                const doc = await db.collection('users').doc(user.uid).get();
                AuthModule.userData = doc.exists ? doc.data() : { name: user.email, role: 'user', premium: false };
                AuthModule.onLogin(user, AuthModule.userData);
            } else {
                AuthModule.currentUser = null;
                AuthModule.userData = null;
                AuthModule.onLogout();
            }
        });
    },

    async register(email, password, extra) {
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(cred.user.uid).set({
                name: extra.name || '',
                email,
                role: 'user',
                premium: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: AuthModule.translateError(e.code) };
        }
    },

    async login(email, password) {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            return { success: true };
        } catch (e) {
            return { success: false, error: AuthModule.translateError(e.code) };
        }
    },

    async logout() {
        await auth.signOut();
    },

    async isPremium() {
        if (!AuthModule.currentUser) return false;
        const doc = await db.collection('users').doc(AuthModule.currentUser.uid).get();
        return doc.exists && doc.data().premium === true;
    },

    async setPremium(uid, status) {
        await db.collection('users').doc(uid).update({ premium: status });
    },

    onLogin(user, data) {
        // Overridden by app.js/admin.js
    },

    onLogout() {
        // Overridden by app.js/admin.js
    },

    translateError(code) {
        const errors = {
            'auth/user-not-found': 'Usuário não encontrado.',
            'auth/wrong-password': 'Senha incorreta.',
            'auth/invalid-credential': 'E-mail ou senha inválidos.',
            'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
            'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
            'auth/invalid-email': 'E-mail inválido.',
            'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento.',
            'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.'
        };
        return errors[code] || 'Erro ao autenticar. Tente novamente.';
    }
};

// ===== DATA MODULE =====
const DataModule = {
    // Channels
    async getChannels() {
        const snap = await db.collection('channels').orderBy('createdAt', 'desc').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getLiveChannels() {
        const snap = await db.collection('channels').where('status', '==', 'live').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    onChannelsChange(callback) {
        return db.collection('channels')
            .onSnapshot(snap => {
                const channels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Sort: live first, then by time
                channels.sort((a, b) => {
                    if (a.status === 'live' && b.status !== 'live') return -1;
                    if (a.status !== 'live' && b.status === 'live') return 1;
                    return (b.syncedAt || b.createdAt || '').toString().localeCompare((a.syncedAt || a.createdAt || '').toString());
                });
                callback(channels);
            });
    },

    async saveChannel(data, id) {
        if (id) {
            await db.collection('channels').doc(id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.viewers = Math.floor(Math.random() * 5000) + 500;
            await db.collection('channels').add(data);
        }
    },

    async deleteChannel(id) {
        await db.collection('channels').doc(id).delete();
    },

    // Access control
    async checkAccess(identifier) {
        const doc = await db.collection('access').doc(identifier).get();
        if (!doc.exists) return { allowed: true };
        const data = doc.data();
        if (data.premium) return { allowed: true, premium: true };
        if (data.blocked) return { allowed: false, blockedAt: data.blockedAt };
        return { allowed: true };
    },

    async blockAccess(identifier) {
        await db.collection('access').doc(identifier).set({
            blocked: true,
            premium: false,
            blockedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    async grantAccess(identifier) {
        await db.collection('access').doc(identifier).set({
            blocked: false,
            premium: true,
            grantedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    // Subscribers
    async getSubscribers() {
        const snap = await db.collection('users').where('premium', '==', true).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
};
