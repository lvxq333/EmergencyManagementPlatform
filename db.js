// db.js - MySQL 数据库连接池配置

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 定义配置对象 (优先使用环境变量，否则使用默认值)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', // 在 .env 中配置数据库密码
    database: process.env.DB_NAME || 'risk_platform_db',   
    waitForConnections: true,
    connectionLimit: 300,
    queueLimit: 0,
    connectTimeout: 10000, // 10秒连接超时
    // 建议添加端口配置，默认为 3306
    port: process.env.DB_PORT || 3306 
};

/**
 * 创建 MySQL 连接池
 */
const pool = mysql.createPool(dbConfig);

// 改进日志：打印实际使用的连接参数（隐藏密码）
console.log(`✅ Database pool created connecting to: ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}`);

// 测试连接（可选，用于启动时快速发现错误）
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Connection established successfully.');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL Connection Failed:', err.message);
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   -> 提示：请检查用户名或密码是否正确');
        } else if (err.code === 'ECONNREFUSED') {
            console.error('   -> 提示：请检查 MySQL 服务是否已启动');
        } else if (err.code === 'ER_BAD_DB_ERROR') {
            console.error('   -> 提示：数据库名不存在，请先运行 SQL 脚本创建数据库');
        }
    });

module.exports = pool;
