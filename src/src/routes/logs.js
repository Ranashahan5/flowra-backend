const express = require('express');
const { query } = require('../../db/connection');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();
router.use(authenticate);
router.get('/', async (req, res) => {
  const { limit=50, offset=0, automation_id } = req.query;
  try {
    let sql = 'SELECT l.*, a.name as automation_name FROM execution_logs l JOIN automations a ON l.automation_id = a.id WHERE l.user_id = $1';
    const params = [req.user.id];
    if (automation_id) { sql += ' AND l.automation_id = $' + (params.length+1); params.push(automation_id); }
    sql += ' ORDER BY l.started_at DESC LIMIT $' + (params.length+1) + ' OFFSET $' + (params.length+2);
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(sql, params);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: 'Could not fetch logs' }); }
});
router.get('/stats', async (req, res) => {
  try { const result = await query("SELECT COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') as runs_today, COUNT(*) FILTER (WHERE status='success') as total_success, COUNT(*) FILTER (WHERE status='failed') as total_failed, AVG(duration_ms) FILTER (WHERE status='success') as avg_duration_ms FROM execution_logs WHERE user_id=$1", [req.user.id]); res.json(result.rows[0]); }
  catch(err) { res.status(500).json({ error: 'Could not fetch stats' }); }
});
router.get('/:id', async (req, res) => {
  try { const result = await query('SELECT l.*, a.name as automation_name FROM execution_logs l JOIN automations a ON l.automation_id=a.id WHERE l.id=$1 AND l.user_id=$2', [req.params.id, req.user.id]); if (!result.rows.length) return res.status(404).json({ error: 'Not found' }); res.json(result.rows[0]); }
  catch(err) { res.status(500).json({ error: 'Could not fetch log' }); }
});
module.exports = router;
