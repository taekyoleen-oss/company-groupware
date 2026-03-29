import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

const BASE_URL    = 'http://localhost:3001'
const OUT_DIR     = './scripts/screenshots'

// .env.local 에서 설정 읽기
const envRaw = fs.readFileSync('.env.local', 'utf-8')
const getEnv = key => { const m = envRaw.match(new RegExp(`^${key}=(.+)$`, 'm')); return m ? m[1].trim() : '' }
const SCREENSHOT_SECRET  = getEnv('SCREENSHOT_SECRET')
const SCREENSHOT_USER_ID = getEnv('SCREENSHOT_USER_ID')

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  ✓ ${name}.png`)
  return file
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  // ── magic link 발급 ────────────────────────────────
  console.log('매직링크 발급 중...')
  const sessionRes = await fetch(`${BASE_URL}/api/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SCREENSHOT_SECRET, userId: SCREENSHOT_USER_ID }),
  })
  const { action_link, error } = await sessionRes.json()
  if (!action_link) {
    console.error('매직링크 발급 실패:', error)
    process.exit(1)
  }
  console.log('  매직링크 획득')

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 },
  })
  const page = await browser.newPage()

  // magic link 방문 → Supabase가 캘린더로 리다이렉트하며 세션 수립
  console.log('인증 중...')
  await page.goto(action_link, { waitUntil: 'networkidle2', timeout: 20000 })
  await sleep(2000)
  console.log('  인증 완료 —', page.url())

  try {
    // ── 1. 로그인 페이지 ─────────────────────────────
    console.log('로그인 페이지...')
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' })
    await sleep(800)
    await shot(page, '01_login')

    // ── 2. (로그인 완료) 캘린더로 이동 ──────────────
    // ── 3. 캘린더 — 월 뷰 ───────────────────────────
    console.log('캘린더 월 뷰...')
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle2' })
    await sleep(2000)
    await shot(page, '02_calendar_month')

    // ── 4. 캘린더 — 주 뷰 ───────────────────────────
    console.log('캘린더 주 뷰...')
    try {
      // '주' 버튼 클릭
      const weekBtn = await page.$('button[title*="주"], .fc-timeGridWeek-button')
      if (weekBtn) {
        await weekBtn.click()
        await sleep(1200)
      } else {
        // 텍스트로 찾기
        const btns = await page.$$eval('button', els => els.map((e, i) => ({ i, t: e.textContent.trim() })))
        const w = btns.find(b => b.t === '주')
        if (w) {
          const all = await page.$$('button')
          await all[w.i].click()
          await sleep(1200)
        }
      }
    } catch {}
    await shot(page, '03_calendar_week')

    // ── 5. 공지사항 목록 ─────────────────────────────
    console.log('공지사항 목록...')
    await page.goto(`${BASE_URL}/notices`, { waitUntil: 'networkidle2' })
    await sleep(1500)
    await shot(page, '04_notices_list')

    // ── 6. 공지사항 상세 ─────────────────────────────
    console.log('공지사항 상세...')
    try {
      const link = await page.$('a[href*="/notices/"]')
      if (link) {
        await link.click()
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 })
        await sleep(1000)
        await shot(page, '05_notice_detail')
      }
    } catch { await shot(page, '05_notice_detail') }

    // ── 7. 공지사항 작성 ─────────────────────────────
    console.log('공지사항 작성 페이지...')
    await page.goto(`${BASE_URL}/notices/new`, { waitUntil: 'networkidle2' })
    await sleep(1200)
    await shot(page, '06_notice_new')

    // ── 8. TO-DO ─────────────────────────────────────
    console.log('TO-DO...')
    await page.goto(`${BASE_URL}/todo`, { waitUntil: 'networkidle2' })
    await sleep(1500)
    await shot(page, '07_todo')

    // ── 9. 프로필 ────────────────────────────────────
    console.log('프로필...')
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle2' })
    await sleep(1200)
    await shot(page, '08_profile')

    // ── 10. 관리자 패널 ──────────────────────────────
    console.log('관리자 패널...')
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' })
    await sleep(1500)
    await shot(page, '09_admin')

    // ── 11. 모바일 뷰 — 캘린더 ───────────────────────
    console.log('모바일 캘린더...')
    await page.setViewport({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle2' })
    await sleep(1800)
    await shot(page, '10_mobile_calendar')

    // ── 12. 모바일 뷰 — TO-DO ────────────────────────
    console.log('모바일 TO-DO...')
    await page.goto(`${BASE_URL}/todo`, { waitUntil: 'networkidle2' })
    await sleep(1200)
    await shot(page, '11_mobile_todo')

  } catch (e) {
    console.error('오류:', e.message)
  } finally {
    await browser.close()
    console.log('\n스크린샷 완료 →', OUT_DIR)
  }
})()
