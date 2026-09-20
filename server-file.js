const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 18080);
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-before-production';
const DATA_FILE = path.resolve(process.env.FILE_DB_PATH || path.join(__dirname, 'data', 'platform.json'));

const DEFAULT_PERMISSIONS = [
    { id: 1, permission_key: 'user:manage', permission_name: '用户管理菜单', module: 'System' },
    { id: 2, permission_key: 'role:manage', permission_name: '角色权限配置', module: 'System' },
    { id: 3, permission_key: 'risk:view_all', permission_name: '查看所有风险数据', module: 'RiskSensing' },
    { id: 4, permission_key: 'risk:trigger_warn', permission_name: '手动触发预警', module: 'RiskSensing' },
    { id: 5, permission_key: 'data:input', permission_name: '传感器数据录入', module: 'DataManagement' }
];

const DEFAULT_ROLES = [
    { id: 1, role_name: 'Administrator', description: '超级管理员，拥有所有权限', permissionIds: [1, 2, 3, 4, 5], created_at: new Date().toISOString() },
    { id: 2, role_name: 'Inspector', description: '现场巡检员，拥有风险感知和数据录入权限', permissionIds: [3, 4, 5], created_at: new Date().toISOString() },
    { id: 3, role_name: 'Viewer', description: '普通查看员，仅有数据查看权限', permissionIds: [3], created_at: new Date().toISOString() }
];

function initialStore() {
    return { users: [], roles: DEFAULT_ROLES, permissions: DEFAULT_PERMISSIONS };
}

function ensureStore() {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(DATA_FILE)) saveStore(initialStore());
}

function loadStore() {
    ensureStore();
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveStore(store) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
    const temporary = `${DATA_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, DATA_FILE);
}

function nextId(rows) {
    return rows.reduce((maximum, row) => Math.max(maximum, Number(row.id) || 0), 0) + 1;
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        realName: user.realName || '',
        email: user.email || '',
        phone: user.phone || '',
        status: user.status || 'active',
        roleIds: user.roleIds || []
    };
}

function requireFields(body, fields) {
    const missing = fields.find((field) => !String(body?.[field] ?? '').trim());
    return missing ? `缺少必填字段: ${missing}` : null;
}

app.use(express.json());
app.use(express.static(__dirname, { dotfiles: 'ignore' }));

app.get('/api/health', (req, res) => {
    const store = loadStore();
    res.json({ status: 'ok', storage: 'file', users: store.users.length });
});

app.post('/api/auth/register', async (req, res, next) => {
    try {
        const error = requireFields(req.body, ['username', 'password']);
        if (error) return res.status(400).json({ message: error });
        const store = loadStore();
        const username = req.body.username.trim();
        if (store.users.some((user) => user.username === username)) {
            return res.status(400).json({ message: '用户名已存在' });
        }
        const id = nextId(store.users);
        const isFirstUser = store.users.length === 0;
        store.users.push({
            id,
            username,
            passwordHash: await bcrypt.hash(req.body.password, 10),
            realName: String(req.body.realName || '').trim(),
            email: '',
            phone: '',
            status: 'active',
            roleIds: [isFirstUser ? 1 : 3],
            created_at: new Date().toISOString()
        });
        saveStore(store);
        res.status(201).json({ message: isFirstUser ? '注册成功，首个账户已设为管理员' : '注册成功', userId: id });
    } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const store = loadStore();
        const user = store.users.find((row) => row.username === String(req.body?.username || '').trim());
        if (!user || user.status !== 'active' || !(await bcrypt.compare(String(req.body?.password || ''), user.passwordHash))) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        const roleNames = store.roles.filter((role) => user.roleIds.includes(role.id)).map((role) => role.role_name);
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            message: '登录成功', token,
            user: { id: user.id, username: user.username, realName: user.realName, roleNames }
        });
    } catch (error) { next(error); }
});

function authenticate(req, res, next) {
    try {
        const authorization = String(req.headers.authorization || '');
        if (!authorization.startsWith('Bearer ')) return res.status(401).json({ message: '请先登录' });
        const payload = jwt.verify(authorization.slice(7), JWT_SECRET);
        const user = loadStore().users.find((row) => row.id === Number(payload.id));
        if (!user || user.status !== 'active') return res.status(401).json({ message: '登录状态无效' });
        req.authUser = user;
        next();
    } catch (error) {
        res.status(401).json({ message: '登录状态已过期，请重新登录' });
    }
}

function requireAdministrator(req, res, next) {
    if (!(req.authUser.roleIds || []).includes(1)) return res.status(403).json({ message: '当前账号没有管理权限' });
    next();
}

app.use(['/api/users', '/api/roles', '/api/permissions'], authenticate, requireAdministrator);

app.get('/api/users', (req, res, next) => {
    try {
        const search = String(req.query.search || '').trim().toLowerCase();
        const users = loadStore().users
            .filter((user) => !search || user.username.toLowerCase().includes(search) || String(user.realName || '').toLowerCase().includes(search))
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .map(publicUser);
        res.json(users);
    } catch (error) { next(error); }
});

app.post('/api/users', async (req, res, next) => {
    try {
        const error = requireFields(req.body, ['username', 'password']);
        if (error) return res.status(400).json({ message: error });
        const store = loadStore();
        const username = req.body.username.trim();
        if (store.users.some((user) => user.username === username)) return res.status(400).json({ message: '用户名已存在' });
        const id = nextId(store.users);
        store.users.push({
            id, username, passwordHash: await bcrypt.hash(req.body.password, 10),
            realName: String(req.body.realName || '').trim(), email: '', phone: '', status: 'active',
            roleIds: Array.isArray(req.body.roleIds) ? req.body.roleIds.map(Number) : [], created_at: new Date().toISOString()
        });
        saveStore(store);
        res.status(201).json({ message: '用户创建成功', id });
    } catch (error) { next(error); }
});

app.put('/api/users/:id', async (req, res, next) => {
    try {
        const store = loadStore();
        const user = store.users.find((row) => row.id === Number(req.params.id));
        if (!user) return res.status(404).json({ message: '用户不存在' });
        const duplicate = store.users.some((row) => row.id !== user.id && row.username === req.body.username);
        if (duplicate) return res.status(400).json({ message: '用户名已存在' });
        user.username = String(req.body.username || user.username).trim();
        user.realName = String(req.body.realName ?? user.realName ?? '').trim();
        if (req.body.password) user.passwordHash = await bcrypt.hash(req.body.password, 10);
        if (Array.isArray(req.body.roleIds)) user.roleIds = req.body.roleIds.map(Number);
        saveStore(store);
        res.json({ message: '用户更新成功' });
    } catch (error) { next(error); }
});

app.delete('/api/users/:id', (req, res, next) => {
    try {
        const store = loadStore();
        const before = store.users.length;
        store.users = store.users.filter((user) => user.id !== Number(req.params.id));
        if (store.users.length === before) return res.status(404).json({ message: '用户不存在' });
        saveStore(store);
        res.json({ message: '用户已删除' });
    } catch (error) { next(error); }
});

app.patch('/api/users/:id/status', (req, res, next) => {
    try {
        const store = loadStore();
        const user = store.users.find((row) => row.id === Number(req.params.id));
        if (!user) return res.status(404).json({ message: '用户不存在' });
        user.status = req.body.status === 'active' ? 'active' : 'inactive';
        saveStore(store);
        res.json({ message: '状态已更新' });
    } catch (error) { next(error); }
});

app.get('/api/roles', (req, res, next) => {
    try { res.json(loadStore().roles); } catch (error) { next(error); }
});

app.get('/api/permissions', (req, res, next) => {
    try { res.json(loadStore().permissions); } catch (error) { next(error); }
});

app.post('/api/roles', (req, res, next) => {
    try {
        const store = loadStore();
        const roleName = String(req.body.role_name || '').trim();
        if (!roleName) return res.status(400).json({ message: '角色名称不能为空' });
        if (store.roles.some((role) => role.role_name === roleName)) return res.status(400).json({ message: '角色名称已存在' });
        const id = nextId(store.roles);
        store.roles.push({ id, role_name: roleName, description: String(req.body.description || ''), permissionIds: req.body.permissionIds || [], created_at: new Date().toISOString() });
        saveStore(store);
        res.status(201).json({ message: '角色创建成功', id });
    } catch (error) { next(error); }
});

app.put('/api/roles/:id', (req, res, next) => {
    try {
        const store = loadStore();
        const role = store.roles.find((row) => row.id === Number(req.params.id));
        if (!role) return res.status(404).json({ message: '角色不存在' });
        role.role_name = String(req.body.role_name || role.role_name).trim();
        role.description = String(req.body.description ?? role.description ?? '');
        role.permissionIds = Array.isArray(req.body.permissionIds) ? req.body.permissionIds.map(Number) : [];
        saveStore(store);
        res.json({ message: '角色更新成功' });
    } catch (error) { next(error); }
});

app.delete('/api/roles/:id', (req, res, next) => {
    try {
        const roleId = Number(req.params.id);
        const store = loadStore();
        if (store.users.some((user) => user.roleIds.includes(roleId))) return res.status(409).json({ message: '该角色仍被用户使用，无法删除' });
        const before = store.roles.length;
        store.roles = store.roles.filter((role) => role.id !== roleId);
        if (store.roles.length === before) return res.status(404).json({ message: '角色不存在' });
        saveStore(store);
        res.json({ message: '角色已删除' });
    } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: '服务器内部错误' });
});

ensureStore();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Risk platform listening on http://0.0.0.0:${PORT}`);
    console.log(`Persistent data file: ${DATA_FILE}`);
});
