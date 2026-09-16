const http = require('http');
const https = require('https');
const BASE_URL = 'http://localhost:5000';
let token = '';
let testStudentId = '', testCourseId = '', testLectureId = '', testCodeId = '', testBlogId = '', testQueryId = '', testCollegeId = '';
let passed = 0, failed = 0;
const failures = [];

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function test(name, fn) {
  try {
    const r = await fn();
    if (r.pass !== false) { passed++; console.log('  ✅ ' + name); }
    else { failed++; console.log('  ❌ ' + name + (r.reason ? ': ' + r.reason : '')); failures.push({name, reason: r.reason}); }
  } catch(e) { failed++; console.log('  💥 ' + name + ': ' + e.message); failures.push({name, reason: e.message}); }
}

const auth = () => ({ Authorization: 'Bearer ' + token });

async function main() {
  console.log('\n══════ FlutterFlirt Admin API Full Audit ══════\n');

  // AUTH
  console.log('📋 AUTH');
  await test('Admin login (valid)', async () => {
    const r = await fetch(BASE_URL+'/api/admin/login', { method:'POST', body: JSON.stringify({email:'admin@flutterflirt.com', password:'admin123'}) });
    if (r.status === 200 && r.body.token) { token = r.body.token; return {pass:true, reason:'Token acquired'}; }
    return {pass:false, reason: 'Status '+r.status+' '+JSON.stringify(r.body)};
  });
  await test('Admin login (wrong password) → 401', async () => {
    const r = await fetch(BASE_URL+'/api/admin/login', { method:'POST', body: JSON.stringify({email:'admin@flutterflirt.com', password:'wrong'}) });
    return {pass: r.status === 401, reason: 'Got '+r.status};
  });

  // DASHBOARD
  console.log('\n📊 DASHBOARD OVERVIEW');
  await test('GET /admin/iot/dashboard-overview', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/dashboard-overview', { headers: auth() });
    return {pass: r.status === 200, reason: 'Status '+r.status+' keys:'+Object.keys(r.body||{}).join(',')};
  });

  // STUDENTS
  console.log('\n👥 STUDENTS');
  await test('GET /admin/iot/students', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/students', { headers: auth() });
    if (r.status === 200) { testStudentId = (r.body.students||[])[0]?.id || ''; return {pass:true, reason:(r.body.students||[]).length+' students'}; }
    return {pass:false, reason:'Status '+r.status};
  });
  await test('GET /admin/iot/students?search=a', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/students?search=a', { headers: auth() });
    return {pass: r.status === 200, reason: 'Status '+r.status};
  });
  await test('GET /admin/iot/students?status=unlocked', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/students?status=unlocked', { headers: auth() });
    return {pass: r.status === 200, reason: 'Status '+r.status};
  });
  const ts = 'auditstu_'+Date.now();
  await test('POST /admin/iot/students (create)', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/students', { method:'POST', headers: auth(), body: JSON.stringify({name:'AuditStudent',email:ts+'@x.com',password:'Test@1234',isKitUnlocked:false}) });
    if (r.status===201||r.status===200) { testStudentId = r.body.student?.id||r.body.id||testStudentId; return {pass:true, reason:'ID:'+testStudentId}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body)};
  });
  if (testStudentId) {
    await test('PATCH /admin/iot/students/:id/toggle-kit', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/students/'+testStudentId+'/toggle-kit', { method:'PATCH', headers: auth(), body: JSON.stringify({isKitUnlocked:true}) });
      return {pass: r.status===200, reason:'Status '+r.status+' '+JSON.stringify(r.body).slice(0,80)};
    });
    await test('DELETE /admin/iot/students/:id (cleanup)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/students/'+testStudentId, { method:'DELETE', headers: auth() });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // COURSES
  console.log('\n📚 COURSES');
  await test('GET /admin/iot/courses', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/courses', { headers: auth() });
    if (r.status===200) { testCourseId=(r.body.courses||[])[0]?.id||''; return {pass:true, reason:(r.body.courses||[]).length+' courses'}; }
    return {pass:false, reason:'Status '+r.status};
  });
  const slug = 'audit-course-'+Date.now();
  await test('POST /admin/iot/courses (create)', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/courses', { method:'POST', headers: auth(), body: JSON.stringify({
      code:'AUD-001', title:'Audit Course', slug, badge:'Test', level:'Beginner', duration:'2 hrs',
      thumbnail_url:'', description:'Audit', overview:'', hardware_items:[], learning_outcomes:[],
      modules:[{id:'m1',title:'Mod 1',lessons:[{id:'l1',title:'Les 1',duration:'05:00',isPreview:true}]}], status:'draft'
    })});
    if (r.status===201||r.status===200) { testCourseId=r.body.course?.id||r.body.id||testCourseId; return {pass:true, reason:'ID:'+testCourseId}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body).slice(0,150)};
  });
  if (testCourseId) {
    await test('PUT /admin/iot/courses/:id (update)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/courses/'+testCourseId, { method:'PUT', headers: auth(), body: JSON.stringify({
        code:'AUD-001', title:'Audit Course Updated', slug:slug+'-v2', badge:'Test', level:'Intermediate', duration:'3 hrs',
        thumbnail_url:'', description:'Updated', overview:'', hardware_items:['Arduino'], learning_outcomes:['Learn'],
        modules:[{id:'m1',title:'Mod 1 Updated',lessons:[{id:'l1',title:'Les 1',duration:'10:00',isPreview:false}]}], status:'published'
      })});
      return {pass: r.status===200, reason:'Status '+r.status};
    });
    await test('DELETE /admin/iot/courses/:id (cleanup)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/courses/'+testCourseId, { method:'DELETE', headers: auth() });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // LECTURES
  console.log('\n🎬 LECTURES');
  await test('GET /admin/iot/lectures', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/lectures', { headers: auth() });
    if (r.status===200) { testLectureId=(r.body.lectures||[])[0]?.id||''; return {pass:true, reason:(r.body.lectures||[]).length+' lectures'}; }
    return {pass:false, reason:'Status '+r.status};
  });
  await test('POST /admin/iot/lectures (create)', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/lectures', { method:'POST', headers: auth(), body: JSON.stringify({
      title:'Audit Lecture', description:'Test', s3_key:'audit/test.mp4', video_url:'https://example.com/v.mp4',
      duration:'05:00', sequence_order:999, is_preview:false, thumbnail_url:'', status:'draft'
    })});
    if (r.status===201||r.status===200) { testLectureId=r.body.lecture?.id||r.body.id||testLectureId; return {pass:true, reason:'ID:'+testLectureId}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body).slice(0,150)};
  });
  if (testLectureId) {
    await test('PUT /admin/iot/lectures/:id (update)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/lectures/'+testLectureId, { method:'PUT', headers: auth(), body: JSON.stringify({
        title:'Audit Lecture Updated', description:'Updated', s3_key:'audit/test.mp4', video_url:'https://example.com/v.mp4',
        duration:'10:00', sequence_order:999, is_preview:true, thumbnail_url:'', status:'published'
      })});
      return {pass: r.status===200, reason:'Status '+r.status};
    });
    await test('DELETE /admin/iot/lectures/:id (cleanup)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/lectures/'+testLectureId, { method:'DELETE', headers: auth() });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // CODES
  console.log('\n🔑 ACCESS CODES');
  await test('GET /admin/iot/codes', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/codes', { headers: auth() });
    if (r.status===200) { testCodeId=(r.body.codes||[])[0]?.id||''; return {pass:true, reason:(r.body.codes||[]).length+' codes'}; }
    return {pass:false, reason:'Status '+r.status};
  });
  await test('POST /admin/iot/codes/generate', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/codes/generate', { method:'POST', headers: auth(), body: JSON.stringify({prefix:'AUDT',count:2,description:'Audit codes',maxUses:1}) });
    if (r.status===201||r.status===200) { testCodeId=r.body.codes?.[0]?.id||testCodeId; return {pass:true, reason:'Generated '+(r.body.codes?.length||0)+' codes'}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body)};
  });
  if (testCodeId) {
    await test('PATCH /admin/iot/codes/:id/toggle', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/codes/'+testCodeId+'/toggle', { method:'PATCH', headers: auth() });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // COLLEGE INQUIRIES
  console.log('\n🏛️  COLLEGE INQUIRIES');
  await test('GET /admin/iot/college-inquiries', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/college-inquiries', { headers: auth() });
    if (r.status===200) { testCollegeId=(r.body.inquiries||[])[0]?.id||''; return {pass:true, reason:(r.body.inquiries||[]).length+' inquiries, stats:'+JSON.stringify(r.body.stats)}; }
    return {pass:false, reason:'Status '+r.status};
  });
  await test('POST /api/iot/college-inquiry (public submit)', async () => {
    const r = await fetch(BASE_URL+'/api/iot/college-inquiry', { method:'POST', body: JSON.stringify({collegeName:'Audit Univ',contactPerson:'Dr Audit',email:'audit_'+Date.now()+'@univ.edu',phone:'+91 9000000000',batchSize:'25+',message:'Audit test'}) });
    if (r.status===201||r.status===200) { testCollegeId=r.body.inquiry?.id||r.body.id||testCollegeId; return {pass:true, reason:'ID:'+testCollegeId}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body)};
  });
  if (testCollegeId) {
    await test('PATCH /admin/iot/college-inquiries/:id (status→contacted)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/college-inquiries/'+testCollegeId, { method:'PATCH', headers: auth(), body: JSON.stringify({status:'contacted'}) });
      return {pass: r.status===200&&r.body.success, reason:'Status '+r.status+' '+r.body.message};
    });
    await test('PATCH /admin/iot/college-inquiries/:id (status→archived = Closed)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/college-inquiries/'+testCollegeId, { method:'PATCH', headers: auth(), body: JSON.stringify({status:'archived'}) });
      return {pass: r.status===200&&r.body.success, reason:'Status '+r.status+' '+r.body.message};
    });
    await test('PATCH /admin/iot/college-inquiries/:id (invalid status→rejected) must fail', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/college-inquiries/'+testCollegeId, { method:'PATCH', headers: auth(), body: JSON.stringify({status:'rejected'}) });
      return {pass: r.status!==200||!r.body.success, reason:'Status '+r.status+' (constraint enforced correctly)'};
    });
    await test('PATCH /admin/iot/college-inquiries/:id (save notes)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/college-inquiries/'+testCollegeId, { method:'PATCH', headers: auth(), body: JSON.stringify({notes:'Audit note saved'}) });
      return {pass: r.status===200&&r.body.success, reason:'Status '+r.status};
    });
    await test('DELETE /admin/iot/college-inquiries/:id (cleanup)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/iot/college-inquiries/'+testCollegeId, { method:'DELETE', headers: auth() });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // BLOGS
  console.log('\n📝 BLOGS');
  await test('GET /api/admin/blogs', async () => {
    const r = await fetch(BASE_URL+'/api/admin/blogs', { headers: auth() });
    if (r.status===200) { testBlogId=(r.body.data||r.body.blogs||[])[0]?.id||''; return {pass:true, reason:(r.body.data||r.body.blogs||[]).length+' blogs'}; }
    return {pass:false, reason:'Status '+r.status};
  });
  await test('POST /api/admin/blogs (create)', async () => {
    const r = await fetch(BASE_URL+'/api/admin/blogs', { method:'POST', headers: auth(), body: JSON.stringify({
      title:'Audit Blog', excerpt:'Test', cover_image:'', category:'Tech', author:'Bot', featured:false, status:'draft',
      sections:[{heading:'Intro',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Test'}]}]}}]
    })});
    if (r.status===201||r.status===200) { testBlogId=r.body.blog?.id||r.body.data?.id||r.body.id||testBlogId; return {pass:true, reason:'ID:'+testBlogId}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body).slice(0,150)};
  });
  if (testBlogId) {
    await test('PUT /api/admin/blogs/:id (update)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/blogs/'+testBlogId, { method:'PUT', headers: auth(), body: JSON.stringify({
        title:'Audit Blog Updated', excerpt:'Updated', cover_image:'', category:'Tech', author:'Bot', featured:true, status:'published',
        sections:[{heading:'Updated',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Updated'}]}]}}]
      })});
      return {pass: r.status===200, reason:'Status '+r.status};
    });
    await test('DELETE /api/admin/blogs/:id (cleanup)', async () => {
      const r = await fetch(BASE_URL+'/api/admin/blogs/'+testBlogId, { method:'DELETE', headers: auth() });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // CONTACT QUERIES
  console.log('\n✉️  CONTACT QUERIES');
  await test('POST /api/contact (public submit)', async () => {
    const r = await fetch(BASE_URL+'/api/contact', { method:'POST', body: JSON.stringify({name:'Audit',email:'audit_'+Date.now()+'@x.com',companyName:'AuditCo',message:'Audit msg'}) });
    if (r.status===201||r.status===200) { testQueryId=r.body.id||r.body.query?.id||''; return {pass:true, reason:'ID:'+testQueryId}; }
    return {pass:false, reason:'Status '+r.status+' '+JSON.stringify(r.body)};
  });
  await test('GET /api/admin/contact-queries', async () => {
    const r = await fetch(BASE_URL+'/api/admin/contact-queries', { headers: auth() });
    const arr = r.body.contactQueries||r.body||[];
    const list = Array.isArray(arr) ? arr : [];
    if (r.status===200) { if (!testQueryId && list.length>0) testQueryId=list[0].id; return {pass:true, reason:list.length+' queries'}; }
    return {pass:false, reason:'Status '+r.status};
  });
  if (testQueryId) {
    await test('PATCH /admin/contact-queries/:id/status', async () => {
      const r = await fetch(BASE_URL+'/api/admin/contact-queries/'+testQueryId+'/status', { method:'PATCH', headers: auth(), body: JSON.stringify({status:'replied'}) });
      return {pass: r.status===200, reason:'Status '+r.status};
    });
  }

  // SECURITY
  console.log('\n🔒 SECURITY');
  await test('No token → 401', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/students');
    return {pass: r.status===401, reason:'Got '+r.status};
  });
  await test('Bad token → 401/403', async () => {
    const r = await fetch(BASE_URL+'/api/admin/iot/courses', { headers: {Authorization:'Bearer bad_token'} });
    return {pass: r.status===401||r.status===403, reason:'Got '+r.status};
  });

  // PUBLIC ROUTES
  console.log('\n🌐 PUBLIC');
  await test('GET /api/iot/courses', async () => {
    const r = await fetch(BASE_URL+'/api/iot/courses');
    return {pass: r.status===200, reason:'Status '+r.status+', '+(r.body.courses||[]).length+' courses'};
  });
  await test('GET /api/iot/lectures', async () => {
    const r = await fetch(BASE_URL+'/api/iot/lectures');
    return {pass: r.status===200, reason:'Status '+r.status};
  });
  await test('GET /api/blogs', async () => {
    const r = await fetch(BASE_URL+'/api/blogs');
    return {pass: r.status===200, reason:'Status '+r.status};
  });

  // SUMMARY
  console.log('\n══════════════════════════════════════');
  console.log('  TOTAL: '+passed+' passed, '+failed+' failed');
  console.log('══════════════════════════════════════');
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log('  ❌ '+f.name+'\n     → '+f.reason));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
