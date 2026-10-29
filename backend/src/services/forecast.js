const { spawn } = require('child_process');
const path = require('path');

function runPython(args) {
  return new Promise((resolve, reject) => {
    const executable = process.env.PYTHON_EXECUTABLE || 'python';
    const script = path.join(__dirname, '..', '..', 'ml', 'forecast.py');
    const child = spawn(executable, [script, ...args], { cwd: path.join(__dirname, '..', '..') });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk.toString());
    child.stderr.on('data', chunk => stderr += chunk.toString());
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `Python exited with code ${code}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Could not parse forecast output. ' + stderr)); }
    });
  });
}
module.exports = { runPython };
