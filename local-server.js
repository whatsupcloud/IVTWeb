const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

const root = process.cwd();
const port = Number(process.env.PORT || 5510);
const dataDir = path.join(root, 'data');
const csvPath = path.join(dataDir, 'enquiries.csv');
const jsonPath = path.join(dataDir, 'enquiries.json');
const logPath = path.join(dataDir, 'enquiries-log.jsonl');
const pendingCsvPath = path.join(dataDir, 'enquiries-pending.csv');
const pendingJsonPath = path.join(dataDir, 'enquiries-pending.jsonl');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
};

const csvHeaders = [
  'submitted_at',
  'full_name',
  'phone_number',
  'email',
  'company_name',
  'service_required',
  'project_budget',
  'preferred_timeline',
  'project_enquiry',
  'source'
];

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, csvHeaders.join(',') + '\n', 'utf8');
  }

  if (!fs.existsSync(jsonPath)) {
    fs.writeFileSync(jsonPath, '[]\n', 'utf8');
  }

}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function escapeCsv(value) {
  const stringValue = String(value == null ? '' : value);
  return '"' + stringValue.replace(/"/g, '""') + '"';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function appendJsonLine(filePath, value) {
  fs.appendFileSync(filePath, JSON.stringify(value) + '\n', 'utf8');
}

function validateEnquiry(payload) {
  const enquiry = {
    submitted_at: new Date().toISOString(),
    full_name: String(payload.full_name || '').trim(),
    phone_number: String(payload.phone_number || '').trim(),
    email: String(payload.email || '').trim(),
    company_name: String(payload.company_name || '').trim(),
    service_required: String(payload.service_required || '').trim(),
    project_budget: String(payload.project_budget || '').trim(),
    preferred_timeline: String(payload.preferred_timeline || '').trim(),
    project_enquiry: String(payload.project_enquiry || '').trim(),
    source: 'website-contact-form'
  };

  if (!enquiry.full_name || !enquiry.phone_number || !enquiry.email || !enquiry.service_required || !enquiry.project_enquiry) {
    return { error: 'Please fill in all required fields.', enquiry };
  }

  return { enquiry };
}

function flushPendingCsvRows() {
  if (!fs.existsSync(pendingCsvPath)) {
    return;
  }

  const pendingRows = fs.readFileSync(pendingCsvPath, 'utf8');
  if (!pendingRows.trim()) {
    return;
  }

  fs.appendFileSync(csvPath, pendingRows, 'utf8');
  fs.writeFileSync(pendingCsvPath, '', 'utf8');
}

function flushPendingJsonEntries() {
  if (!fs.existsSync(pendingJsonPath)) {
    return;
  }

  const pendingRaw = fs.readFileSync(pendingJsonPath, 'utf8').trim();
  if (!pendingRaw) {
    return;
  }

  const entries = pendingRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const existing = readJsonArray(jsonPath);
  existing.push(...entries);
  fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  fs.writeFileSync(pendingJsonPath, '', 'utf8');
}

function saveEnquiry(enquiry) {
  ensureDataStore();
  appendJsonLine(logPath, enquiry);

  const csvRow = csvHeaders.map(header => escapeCsv(enquiry[header])).join(',') + '\n';
  let csvQueued = false;
  let jsonQueued = false;

  try {
    flushPendingCsvRows();
    fs.appendFileSync(csvPath, csvRow, 'utf8');
  } catch (error) {
    csvQueued = true;
    fs.appendFileSync(pendingCsvPath, csvRow, 'utf8');
  }

  try {
    flushPendingJsonEntries();
    const existing = readJsonArray(jsonPath);
    existing.push(enquiry);
    fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  } catch (error) {
    jsonQueued = true;
    appendJsonLine(pendingJsonPath, enquiry);
  }

  return {
    csvQueued,
    jsonQueued,
    csv: path.relative(root, csvPath),
    json: path.relative(root, jsonPath),
    log: path.relative(root, logPath),
    pendingCsv: path.relative(root, pendingCsvPath),
    pendingJson: path.relative(root, pendingJsonPath)
  };
}

function getMailConfig() {
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  return {
    host: process.env.SMTP_HOST || '',
    port: smtpPort,
    secure: String(process.env.SMTP_SECURE || (smtpPort === 465 ? 'true' : 'false')).toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    notifyEmail: process.env.ENQUIRY_NOTIFY_EMAIL || process.env.SMTP_USER || ''
  };
}

function isMailConfigured(config) {
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

function createResponseReader(socket) {
  let buffer = '';
  let lines = [];
  const queue = [];

  function resolveNext(payload, isError) {
    const waiter = queue.shift();
    if (!waiter) return;
    if (isError) {
      waiter.reject(payload);
    } else {
      waiter.resolve(payload);
    }
  }

  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop();

    parts.forEach(line => {
      if (!line) {
        return;
      }

      lines.push(line);
      if (/^\d{3} /.test(line)) {
        const text = lines.join('\n');
        lines = [];
        resolveNext(text, false);
      }
    });
  });

  socket.on('error', error => {
    while (queue.length) {
      resolveNext(error, true);
    }
  });

  socket.on('close', () => {
    while (queue.length) {
      resolveNext(new Error('SMTP connection closed unexpectedly.'), true);
    }
  });

  return function nextResponse() {
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject });
    });
  };
}

function parseSmtpCode(responseText) {
  const match = String(responseText || '').match(/^(\d{3})/m);
  return match ? Number(match[1]) : 0;
}

async function sendSmtpMail(config, message) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });

    socket.setEncoding('utf8');
    socket.setTimeout(20000, () => {
      socket.destroy(new Error('SMTP connection timed out.'));
    });

    const nextResponse = createResponseReader(socket);

    function writeLine(line) {
      socket.write(line + '\r\n');
    }

    function expect(codeList, responseText) {
      const code = parseSmtpCode(responseText);
      if (codeList.indexOf(code) === -1) {
        throw new Error(responseText);
      }
    }

    socket.on('connect', async () => {
      try {
        expect([220], await nextResponse());
        writeLine('EHLO ivt.local');
        expect([250], await nextResponse());
        writeLine('AUTH LOGIN');
        expect([334], await nextResponse());
        writeLine(Buffer.from(config.user).toString('base64'));
        expect([334], await nextResponse());
        writeLine(Buffer.from(config.pass).toString('base64'));
        expect([235], await nextResponse());
        writeLine('MAIL FROM:<' + config.from + '>');
        expect([250], await nextResponse());
        writeLine('RCPT TO:<' + message.to + '>');
        expect([250, 251], await nextResponse());
        writeLine('DATA');
        expect([354], await nextResponse());

        const headers = [
          'From: ' + config.from,
          'To: ' + message.to,
          'Subject: ' + message.subject,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8'
        ].join('\r\n');

        const body = String(message.text || '').replace(/^\./gm, '..');
        socket.write(headers + '\r\n\r\n' + body + '\r\n.\r\n');
        expect([250], await nextResponse());
        writeLine('QUIT');
        await nextResponse().catch(() => null);
        socket.end();
        resolve();
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });

    socket.on('error', reject);
  });
}

function buildCustomerMail(enquiry) {
  return {
    subject: 'IVT enquiry received',
    text: [
      'Hello ' + enquiry.full_name + ',',
      '',
      'Thank you for contacting Involytics Technology (IVT).',
      'We have received your project enquiry and our team will review it shortly.',
      '',
      'Service required: ' + enquiry.service_required,
      'Company: ' + (enquiry.company_name || 'Not provided'),
      'Submitted on: ' + enquiry.submitted_at,
      '',
      'Your enquiry summary:',
      enquiry.project_enquiry,
      '',
      'Our team will reach out to you on your shared contact details soon.',
      '',
      'Regards,',
      'Involytics Technology (IVT)',
      'Pune, Maharashtra, India',
      'inovalyticstechnology@gmail.com'
    ].join('\n')
  };
}

function buildInternalMail(enquiry) {
  return {
    subject: 'New IVT website enquiry from ' + enquiry.full_name,
    text: [
      'A new enquiry has been submitted through the IVT website.',
      '',
      'Submitted at: ' + enquiry.submitted_at,
      'Full Name: ' + enquiry.full_name,
      'Contact Number: ' + enquiry.phone_number,
      'Email ID: ' + enquiry.email,
      'Company Name: ' + (enquiry.company_name || 'Not provided'),
      'Service Required: ' + enquiry.service_required,
      '',
      'Project Enquiry:',
      enquiry.project_enquiry,
      '',
      'Source: ' + enquiry.source
    ].join('\n')
  };
}

async function sendEnquiryEmails(enquiry) {
  const config = getMailConfig();
  if (!isMailConfigured(config)) {
    return { enabled: false, customerSent: false, internalSent: false };
  }

  const result = { enabled: true, customerSent: false, internalSent: false };

  const customerMail = buildCustomerMail(enquiry);
  const internalMail = buildInternalMail(enquiry);

  await sendSmtpMail(config, {
    to: enquiry.email,
    subject: customerMail.subject,
    text: customerMail.text
  });
  result.customerSent = true;

  if (config.notifyEmail) {
    await sendSmtpMail(config, {
      to: config.notifyEmail,
      subject: internalMail.subject,
      text: internalMail.text
    });
    result.internalSent = true;
  }

  return result;
}

ensureDataStore();

setInterval(() => {
  try {
    flushPendingCsvRows();
    flushPendingJsonEntries();
  } catch (error) {
    // The next sync cycle will retry automatically when the files are available.
  }
}, 15000);

http.createServer(async (req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'POST' && u === '/api/enquiries') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const { enquiry, error } = validateEnquiry(payload);

      if (error) {
        return sendJson(res, 400, { ok: false, message: error });
      }

      const storage = saveEnquiry(enquiry);
      let email = { enabled: false, customerSent: false, internalSent: false };
      let message = 'Thank you. Your enquiry has been received successfully. Our team will review your requirement and get in touch with you shortly.';

      try {
        email = await sendEnquiryEmails(enquiry);
        if (email.customerSent) {
          message += ' A confirmation email has been sent to your inbox.';
        }
      } catch (mailError) {
        email = {
          enabled: true,
          customerSent: false,
          internalSent: false,
          error: 'Enquiry saved, but confirmation email could not be sent right now.'
        };
      }

      if (storage.csvQueued || storage.jsonQueued) {
        message += ' Your enquiry is safely recorded and will sync to the Excel register automatically once the file becomes available.';
      }

      return sendJson(res, 200, {
        ok: true,
        message,
        storage,
        email
      });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        message: 'Unable to save enquiry right now.'
      });
    }
  }

  const rel = u === '/' ? '/index.html' : u;
  const file = path.normalize(path.join(root, rel));

  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  });
}).listen(port, () => {
  console.log('IVT server running on http://127.0.0.1:' + port);
  console.log('CSV file: ' + csvPath);
  console.log('JSON file: ' + jsonPath);
  console.log('Log file: ' + logPath);
});


