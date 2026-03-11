const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number(process.env.PORT || 5510);
const dataDir = path.join(root, 'data');
const csvPath = path.join(dataDir, 'enquiries.csv');
const jsonPath = path.join(dataDir, 'enquiries.json');
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

function saveEnquiry(enquiry) {
  ensureDataStore();

  const csvRow = csvHeaders.map(header => escapeCsv(enquiry[header])).join(',') + '\n';
  fs.appendFileSync(csvPath, csvRow, 'utf8');

  const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  existing.push(enquiry);
  fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
}

ensureDataStore();

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

      saveEnquiry(enquiry);
      return sendJson(res, 200, {
        ok: true,
        message: 'Enquiry saved successfully.',
        files: {
          csv: 'data/enquiries.csv',
          json: 'data/enquiries.json'
        }
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
}).listen(port, '127.0.0.1', () => {
  console.log('IVT server running on http://127.0.0.1:' + port);
  console.log('CSV file: ' + csvPath);
  console.log('JSON file: ' + jsonPath);
});

