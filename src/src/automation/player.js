const { query } = require('../../db/connection');
const runningTasks = new Map();
async function runAutomation(automation) {
  if (runningTasks.has(automation.id)) return;
  const logResult = await query('INSERT INTO execution_logs (automation_id, user_id, status, steps_total) VALUES ($1,$2,$3,$4) RETURNING id', [automation.id, automation.user_id, 'running', automation.steps.length]);
  const logId = logResult.rows[0].id;
  const startTime = Date.now();
  runningTasks.set(automation.id, logId);
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width:1280, height:720 });
    await page.goto(automation.start_url, { waitUntil:'networkidle2', timeout:30000 });
    let stepsCompleted = 0;
    for (const step of automation.steps) { await executeStep(page, step); stepsCompleted++; await new Promise(r => setTimeout(r, 300 + Math.random()*400)); }
    await query('UPDATE execution_logs SET status=$1, finished_at=NOW(), duration_ms=$2, steps_completed=$3 WHERE id=$4', ['success', Date.now()-startTime, stepsCompleted, logId]);
    await query('UPDATE automations SET last_run_at=NOW() WHERE id=$1', [automation.id]);
  } catch(err) {
    await query('UPDATE execution_logs SET status=$1, finished_at=NOW(), duration_ms=$2, error_message=$3 WHERE id=$4', ['failed', Date.now()-startTime, err.message, logId]);
  } finally { if (browser) await browser.close(); runningTasks.delete(automation.id); }
}
async function executeStep(page, step) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  switch(step.type) {
    case 'click': await page.waitForSelector(step.selector, {timeout:10000}); await page.click(step.selector); break;
    case 'type': await page.waitForSelector(step.selector, {timeout:10000}); await page.keyboard.type(step.value, {delay:50}); break;
    case 'fill': await page.waitForSelector(step.selector, {timeout:10000}); await page.click(step.selector, {clickCount:3}); await page.keyboard.type(step.value, {delay:50}); break;
    case 'select': await page.waitForSelector(step.selector, {timeout:10000}); await page.select(step.selector, step.value); break;
    case 'navigate': await page.goto(step.url, {waitUntil:'networkidle2', timeout:30000}); break;
    case 'waitForElement': await page.waitForSelector(step.selector, {timeout:15000}); break;
    case 'wait': await sleep(parseInt(step.value)||1000); break;
    case 'keyPress': await page.keyboard.press(step.key||'Enter'); break;
    case 'scroll': step.selector ? await page.evaluate(s => document.querySelector(s)?.scrollIntoView(), step.selector) : await page.evaluate(y => window.scrollTo(0,y), step.value||500); break;
  }
}
module.exports = { runAutomation };
