const logs = [];
const MAX_LOGS = 500;

function addLog(message, level = 'info') {
  const entry = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  console.log(`[${level.toUpperCase()}] ${message}`);
  return entry;
}

function getLogs() { return logs; }
function clearLogs() { logs.length = 0; }

module.exports = { addLog, getLogs, clearLogs };
