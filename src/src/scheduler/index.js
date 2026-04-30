const cron = require('node-cron');
const { query } = require('../db/connection');
const { runAutomation } = require('../automation/player');
function startScheduler() {
  console.log('[Scheduler] Started');
  cron.schedule('* * * * *', async () => {
    try {
      const result = await query("SELECT * FROM automations WHERE is_active=true AND trigger_type='schedule'", []);
      const now = new Date();
      for (const automation of result.rows) {
        const config = automation.trigger_config;
        if (!config?.cron || !cron.validate(config.cron)) continue;
        if (automation.last_run_at && (now - new Date(automation.last_run_at))/1000 < 50) continue;
        if (shouldRunNow(config.cron, now)) runAutomation(automation).catch(console.error);
      }
    } catch(err) { console.error('[Scheduler] Error:', err.message); }
  });
}
function shouldRunNow(expr, now) {
  const parts = expr.trim().split(' ');
  if (parts.length !== 5) return false;
  const [m,h,dom,mo,dow] = parts;
  return match(m,now.getMinutes()) && match(h,now.getHours()) && match(dom,now.getDate()) && match(mo,now.getMonth()+1) && match(dow,now.getDay());
}
function match(field, val) {
  if (field==='*') return true;
  if (field.startsWith('*/')) return val % parseInt(field.slice(2)) === 0;
  if (field.includes('-')) { const [a,b]=field.split('-').map(Number); return val>=a && val<=b; }
  if (field.includes(',')) return field.split(',').map(Number).includes(val);
  return parseInt(field)===val;
}
module.exports = { startScheduler };
