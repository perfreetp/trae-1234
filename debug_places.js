const http = require('http');
function req(method, path, token, body) {
  return new Promise(resolve => {
    const b = body ? JSON.stringify(body) : null;
    const opts = {
      host: '127.0.0.1', port: 3001, method, path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(b || '')
      }
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); } catch(e) { resolve({ status: res.statusCode, body: buf }); } });
    });
    if (b) r.write(b);
    r.end();
  });
}

async function main() {
  const login = await req('POST', '/api/auth/login', null, { username: 'patrol', password: 'patrol123' });
  console.log('登录状态:', login.status);
  if (!login.data?.data?.token) { console.log('登录失败'); return; }
  const token = login.data.data.token;
  console.log('用户信息:', JSON.stringify(login.data.data.user));

  console.log('\n1. GET /api/places:');
  const r1 = await req('GET', '/api/places', token);
  console.log('  状态码:', r1.status);
  console.log('  返回:', JSON.stringify(r1.data?.code || r1.data));

  console.log('\n2. GET /api/auth/users:');
  const r2 = await req('GET', '/api/auth/users', token);
  console.log('  状态码:', r2.status);
  console.log('  返回:', JSON.stringify(r2.data?.code || r2.data?.message));

  console.log('\n3. GET /api/events:');
  const r3 = await req('GET', '/api/events', token);
  console.log('  状态码:', r3.status);
  console.log('  返回:', JSON.stringify(r3.data?.code || r3.data?.message));

  console.log('\n4. GET /api/places/categories:');
  const r4 = await req('GET', '/api/places/categories', token);
  console.log('  状态码:', r4.status);
  console.log('  返回:', JSON.stringify(r4.data?.code || r4.data?.message));
}
main();
