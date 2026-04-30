const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, max: 10, idleTimeoutMillis: 30000 });
pool.connect((err, client, release) => {
 if (err) {
 console.error('❌ Database connection failed:', err.message);
 } else {
 console.log('✅ Database connected');
 release();
 }
});
const query = async (text, params) => {
 const result = await pool.query(text, params);
 return result;
};
module.exports = { query, pool };