// Service Worker ของ Smart Class — ทำให้แอปเปิดขึ้นทันทีและยังเปิดดูได้ตอนเน็ตโรงเรียนหลุด
//
// ⚠️ หลักการที่ห้ามสลับ:
//   1. หน้าเว็บ (HTML) เอาจากเน็ตก่อนเสมอ ใช้ของที่เก็บไว้ต่อเมื่อเน็ตไม่มาภายใน 4 วินาที
//      ถ้าสลับเป็นเอาของเก่าก่อน ครูจะแก้โค้ดแล้วไม่เห็นผล และเด็กจะติดอยู่กับเวอร์ชันเก่าไปเรื่อยๆ
//   2. คำขอไปหลังบ้าน (script.google.com) ห้ามแตะเด็ดขาด ไม่เก็บ ไม่ตอบแทน
//      คะแนนกับแต้มต้องเป็นของจริงจากเซิร์ฟเวอร์เท่านั้น การตอบด้วยของเก่าคือการโกหกเรื่องคะแนน
//   3. ไลบรารีจาก CDN ปักเลขเวอร์ชันไว้ทุกตัว ที่อยู่เดิมจึงให้ของเดิมเสมอ เก็บไว้ยาวๆ ได้ปลอดภัย
//
// อัปเดตเวอร์ชันแคชเมื่อเปลี่ยนไฟล์ในนี้ ของเก่าจะถูกลบทิ้งตอน activate
const CACHE = 'smartclass-v1';
const SHELL = './';                      // หน้าเว็บหลัก ใช้เป็นตัวสำรองตอนออฟไลน์
const HTML_TIMEOUT_MS = 4000;

// ที่อยู่ที่เก็บไว้ได้ยาว เพราะปักเวอร์ชันไว้แล้ว (ที่อยู่เดิม = ของเดิมเสมอ)
const CACHEABLE_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.add(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// เอาจากเน็ตก่อน ถ้าเกินเวลาหรือเน็ตไม่มา ค่อยใช้ของที่เก็บไว้
function networkFirst_(req) {
  return new Promise((resolve) => {
    let settled = false;
    const offlineNote = () => new Response(
      'ออฟไลน์ และยังไม่เคยเก็บหน้านี้ไว้ในเครื่อง — ต่อเน็ตแล้วเปิดใหม่อีกครั้ง',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
    const fallback = () => {
      if (settled) return;
      settled = true;
      caches.match(req)
        .then(hit => hit || caches.match(SHELL))
        .then(hit => resolve(hit || offlineNote()))
        .catch(() => resolve(offlineNote()));
    };
    const timer = setTimeout(fallback, HTML_TIMEOUT_MS);
    fetch(req)
      .then(res => {
        clearTimeout(timer);
        if (settled) return;                       // ช้าไป ผู้ใช้ได้ของเก่าไปแล้ว แต่ยังเก็บของใหม่ไว้ให้รอบหน้า
        settled = true;
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        resolve(res);
      })
      .catch(() => { clearTimeout(timer); fallback(); });
  });
}

// เอาของที่เก็บไว้ก่อน ไม่มีค่อยโหลดแล้วเก็บไว้
function cacheFirst_(req) {
  return caches.match(req).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    });
  });
}

// ตัดสินว่าคำขอนี้จะทำยังไง — แยกออกมาเป็นฟังก์ชันล้วนๆ เพื่อให้ทดสอบได้ในเครื่องโดยไม่ต้องมีเบราว์เซอร์
//   'pass'          = ไม่แตะเลย ปล่อยไปตามปกติ
//   'network-first' = เอาจากเน็ตก่อน เน็ตไม่มาค่อยใช้ของที่เก็บไว้ (หน้าเว็บ)
//   'cache-first'   = ใช้ของที่เก็บไว้ก่อน (ไลบรารีที่ปักเวอร์ชันแล้ว · ไอคอน · ไฟล์ในเว็บเรา)
function routeFor_(method, urlStr, mode, selfOrigin) {
  if (method !== 'GET') return 'pass';                         // ทุกการส่งข้อมูลขึ้นเซิร์ฟเวอร์ ปล่อยผ่านเสมอ
  let url;
  try { url = new URL(urlStr); } catch (err) { return 'pass'; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'pass';

  const h = url.hostname;
  // ⚠️ หลังบ้าน — ห้ามแตะเด็ดขาด คะแนนและแต้มต้องมาจากเซิร์ฟเวอร์เท่านั้น
  if (h === 'script.google.com' || h.endsWith('.script.google.com')) return 'pass';
  if (h.endsWith('googleusercontent.com')) return 'pass';      // ปลายทางที่คำขอหลังบ้านถูกส่งต่อไป
  if (h.endsWith('openstreetmap.org')) return 'pass';          // แผ่นแผนที่มีเป็นพันแผ่น เก็บแล้วบวมโดยไม่ได้ช่วยอะไร
  if (h.endsWith('youtube.com') || h.endsWith('ytimg.com') || h.endsWith('youtube-nocookie.com')) return 'pass';

  if (mode === 'navigate') return 'network-first';
  if (url.origin === selfOrigin && (url.pathname === '/' || url.pathname.endsWith('/index.html'))) return 'network-first';
  if (url.origin === selfOrigin) return 'cache-first';
  if (CACHEABLE_HOSTS.indexOf(h) > -1) return 'cache-first';
  return 'pass';
}

self.addEventListener('fetch', (e) => {
  let plan = 'pass';
  try { plan = routeFor_(e.request.method, e.request.url, e.request.mode, self.location.origin); }
  catch (err) { plan = 'pass'; }                               // ตัดสินใจไม่ได้ = ไม่แตะ ปลอดภัยกว่าเดาแล้วตอบผิด
  if (plan === 'network-first') e.respondWith(networkFirst_(e.request).catch(() => fetch(e.request)));
  else if (plan === 'cache-first') e.respondWith(cacheFirst_(e.request).catch(() => fetch(e.request)));
});

// ⚠️ ถ้าวันหนึ่งไฟล์นี้ทำให้แอปมีปัญหา: แทนที่ทั้งไฟล์ด้วย 3 บรรทัดนี้แล้ว deploy
//    self.addEventListener('install', () => self.skipWaiting());
//    self.addEventListener('activate', e => e.waitUntil(self.registration.unregister()
//      .then(() => caches.keys()).then(k => Promise.all(k.map(x => caches.delete(x))))));
//    เครื่องที่เปิดแอปครั้งถัดไปจะถอนตัวช่วยนี้ออกและลบของที่เก็บไว้ทั้งหมด กลับไปเหมือนไม่เคยมี
