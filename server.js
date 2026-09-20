const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db'); // 引用您刚才修改好的 db.js

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_risk_platform';

// --- 中间件 ---
app.use(cors()); // 允许跨域请求
app.use(express.json()); // 解析 JSON 请求体
app.use(express.static('.')); // 配置静态文件服务，允许直接访问根目录下的HTML文件

// --- 辅助函数：字段映射 ---
// 将数据库格式转换为前端格式
const mapUserToFrontend = (user, roleIds = []) => ({
    id: user.id,
    username: user.username,
    realName: user.real_name, // DB: real_name -> Frontend: realName
    email: user.email,
    phone: user.phone,
    status: user.is_active === 1 ? 'active' : 'inactive', // DB: 1/0 -> Frontend: active/inactive
    roleIds: roleIds
});

// --- 1. 认证接口 (Auth) ---

// 用户登录接口修改
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // 1. 查询用户及关联的角色名称
        const query = `
            SELECT u.*, GROUP_CONCAT(r.role_name) as roleNames 
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.username = ?
            GROUP BY u.id
        `;
        const [users] = await pool.query(query, [username]);

        if (users.length === 0) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }

        const user = users[0];

        // 2. 验证密码
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }

        // 3. 生成 Token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 4. 返回用户信息（包含角色）
        res.json({
            message: '登录成功',
            token,
            user: {
                id: user.id,
                username: user.username,
                realName: user.real_name,
                roleNames: user.roleNames ? user.roleNames.split(',') : []
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 用户注册
app.post('/api/auth/register', async (req, res) => {
    const { username, password, realName } = req.body;
    try {
        // 1. 检查用户名是否存在
        const [exists] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (exists.length > 0) {
            return res.status(400).json({ message: '用户名已存在' });
        }

        // 2. 加密密码
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. 插入数据库 (默认分配普通用户角色，假设角色ID 3 是 Viewer)
        // 注意：前端发来 realName，插入到 real_name
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, real_name, is_active) VALUES (?, ?, ?, 1)',
            [username, passwordHash, realName]
        );

        // 可选：在这里给新用户默认分配一个角色 (例如角色ID 2 或 3)
        // await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.insertId, 3]);

        res.status(201).json({ message: '注册成功', userId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '注册失败: ' + err.message });
    }
});

// --- 2. 用户管理接口 (User Management) ---

// 获取用户列表 (支持搜索功能)
app.get('/api/users', async (req, res) => {
    try {
        const { search } = req.query; // 获取 URL 参数 ?search=...

        let sql = 'SELECT * FROM users';
        let queryParams = [];

        // 如果有搜索关键词，添加 WHERE 子句
        if (search) {
            // WHERE (username LIKE %关键词% OR real_name LIKE %关键词%)
            sql += ' WHERE username LIKE ? OR real_name LIKE ?';
            const fuzzySearch = `%${search}%`; // 添加 % 实现模糊匹配
            queryParams.push(fuzzySearch, fuzzySearch);
        }

        // 保持按时间倒序排列
        sql += ' ORDER BY created_at DESC';

        // 1. 获取符合条件的用户
        const [users] = await pool.query(sql, queryParams);

        // 2. 获取所有角色关联 (这部分保持不变)
        const [userRoles] = await pool.query('SELECT * FROM user_roles');

        // 3. 组装数据 (映射逻辑保持不变)
        const responseData = users.map(user => {
            const roles = userRoles
                .filter(ur => ur.user_id === user.id)
                .map(ur => ur.role_id);
            return mapUserToFrontend(user, roles);
        });

        res.json(responseData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// 新增用户 (管理员操作)
app.post('/api/users', async (req, res) => {
    const { username, password, realName, roleIds } = req.body;
    try {
        // 加密密码
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 插入用户
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, real_name, is_active) VALUES (?, ?, ?, 1)',
            [username, passwordHash, realName]
        );
        const newUserId = result.insertId;

        // 插入角色关联
        if (roleIds && roleIds.length > 0) {
            const roleValues = roleIds.map(rid => [newUserId, rid]);
            await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [roleValues]);
        }

        res.status(201).json({ message: '用户创建成功', id: newUserId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 编辑用户
app.put('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    const { username, realName, roleIds, password } = req.body; // password 可选

    try {
        // 1. 更新基本信息
        let sql = 'UPDATE users SET username = ?, real_name = ?';
        let params = [username, realName];

        // 如果提供了新密码，则更新密码
        if (password) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            sql += ', password_hash = ?';
            params.push(passwordHash);
        }

        sql += ' WHERE id = ?';
        params.push(userId);

        await pool.query(sql, params);

        // 2. 更新角色 (先删除旧关联，再插入新关联)
        if (roleIds) {
            await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
            if (roleIds.length > 0) {
                const roleValues = roleIds.map(rid => [userId, rid]);
                await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [roleValues]);
            }
        }

        res.json({ message: '用户更新成功' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 删除用户
app.delete('/api/users/:id', async (req, res) => {
    try {
        // 由于数据库设置了 ON DELETE CASCADE，删除用户会自动删除 user_roles 中的记录
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: '用户已删除' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 修改用户状态 (激活/禁用)
app.patch('/api/users/:id/status', async (req, res) => {
    const { status } = req.body; // 前端传 'active' 或 'inactive'
    const isActive = status === 'active' ? 1 : 0; // 转换为 DB 格式

    try {
        await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, req.params.id]);
        res.json({ message: '状态已更新' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- 3. 角色与权限接口 (Role & Permissions) ---

// 获取所有角色 (包含权限ID)
app.get('/api/roles', async (req, res) => {
    try {
        const [roles] = await pool.query('SELECT * FROM roles');
        const [rolePerms] = await pool.query('SELECT * FROM role_permissions');

        const responseData = roles.map(role => {
            const permissionIds = rolePerms
                .filter(rp => rp.role_id === role.id)
                .map(rp => rp.permission_id);
            return {
                ...role,
                permissionIds // 前端需要这个数组
            };
        });

        res.json(responseData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 获取所有权限点
app.get('/api/permissions', async (req, res) => {
    try {
        const [permissions] = await pool.query('SELECT * FROM permissions');
        res.json(permissions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 新增角色
app.post('/api/roles', async (req, res) => {
    const { role_name, description, permissionIds } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO roles (role_name, description) VALUES (?, ?)',
            [role_name, description]
        );
        const roleId = result.insertId;

        if (permissionIds && permissionIds.length > 0) {
            const values = permissionIds.map(pid => [roleId, pid]);
            await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
        }
        res.json({ message: '角色创建成功', id: roleId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 编辑角色
app.put('/api/roles/:id', async (req, res) => {
    const roleId = req.params.id;
    const { role_name, description, permissionIds } = req.body;
    try {
        await pool.query('UPDATE roles SET role_name = ?, description = ? WHERE id = ?',
            [role_name, description, roleId]);

        // 更新权限：先删后加
        await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        if (permissionIds && permissionIds.length > 0) {
            const values = permissionIds.map(pid => [roleId, pid]);
            await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
        }
        res.json({ message: '角色更新成功' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 删除角色
app.delete('/api/roles/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
        res.json({ message: '角色删除成功' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- 启动服务器 ---
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`   - API Endpoint: http://localhost:${PORT}/api`);
});
