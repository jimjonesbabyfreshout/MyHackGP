import { exec } from 'child_process';
import { NextApiRequest, NextApiResponse } from 'next';

export enum Role {
  User = 'user',
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestHost = req.headers.host;

  if (
    !requestHost ||
    !(
      requestHost.endsWith('.hackergpt.co') ||
      requestHost.endsWith('.hackergpt.chat')
    )
  ) {
    res
      .status(403)
      .json({ message: 'Forbidden: Access is denied from this domain.' });
    return;
  }
  let gauOutput = '';

  const authHeader = req.headers.authorization;
  const expectedAuthValue = process.env.SECRET_AUTH_PLUGINS;

  if (!authHeader || authHeader !== expectedAuthValue) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const {
    target,
    blacklist,
    fc,
    fromDate,
    ft,
    fp,
    mc,
    mt,
    providers,
    includeSubdomains,
    toDate,
  } = req.query;

  let command = `gau --timeout 60 --json`;

  if (target) {
    command += ` ${target}`;
  }
  if (blacklist) {
    command += ` --blacklist ${blacklist}`;
  }
  if (fc) {
    command += ` --fc ${fc}`;
  }
  if (fromDate) {
    command += ` --from ${fromDate}`;
  }
  if (ft) {
    command += ` --ft ${ft}`;
  }
  if (fp === 'true') {
    command += ` --fp`;
  }
  if (mc) {
    command += ` --mc ${mc}`;
  }
  if (mt) {
    command += ` --mt ${mt}`;
  }
  if (providers) {
    command += ` --providers ${providers}`;
  }
  if (toDate) {
    command += ` --to ${toDate}`;
  }

  console.log('Executing gau command:', command);

  if (command.length > 2000) {
    return res.status(400).json({ message: 'Command too long' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sendSSEMessage(res, 'Starting gau process...');

  const gauProcess = exec(command, { maxBuffer: 1024 * 1024 * 10 });
  let isTimeout = false;

  const progressInterval = setInterval(() => {
    sendSSEMessage(res, 'Still processing...');
  }, 5000);

  const timeout = setTimeout(() => {
    isTimeout = true;
    gauProcess.kill('SIGTERM');
    sendSSEMessage(res, 'Gau process timed out.');
    clearInterval(progressInterval);
    res.end();
  }, 60000);

  gauProcess.stdout?.on('data', (data) => {
    sendSSEMessage(res, data.toString());
  });

  gauProcess.stderr?.on('data', (data) => {
    sendSSEMessage(res, `ERROR: ${data.toString()}`);
  });

  gauProcess.on('close', (code) => {
    if (!isTimeout) {
      clearTimeout(timeout);
      clearInterval(progressInterval);
      sendSSEMessage(res, 'Gau process completed.');
      res.end();
    }
  });

  gauProcess.on('error', (error) => {
    if (!isTimeout) {
      clearTimeout(timeout);
      clearInterval(progressInterval);
      console.error(`Error executing Docker command: ${error}`);
      sendSSEMessage(res, `Error: ${error.message}`);
      res.end();
    }
  });
}

function sendSSEMessage(res: NextApiResponse, data: string) {
  res.write(`data: ${data}\n\n`);
}
