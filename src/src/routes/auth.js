const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');
const { validateEmail } = require('../middleware/security');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.post('/register', async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try { email = validateEmail(email); } catch(err) { return res.status(400).json({ error: err.message }); }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, plan', [email, passwordHash]);
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch(err) { res.status(500).json({ error: 'Registration failed' }); }
});
router.post('/login', async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await query('SELECT id, email, password_hash, plan FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, plan: user.plan } });
  } catch(err) { res.status(500).json({ error: 'Login failed' }); }
});
router.get('/me', authenticate, async (req, res) => {
  try { const result = await query('SELECT id, email, plan, created_at FROM users WHERE id = $1', [req.user.id]); res.json(result.rows[0]); }
  catch(err) { res.status(500).json({ error: 'Could not fetch user' }); }
});
module.exports = router;

