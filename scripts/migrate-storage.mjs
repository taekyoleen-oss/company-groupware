// Storage 버킷 이전 스크립트 (구 → 신 프로젝트)
// 실행: OLD_URL=... OLD_SERVICE_KEY=... NEW_URL=... NEW_SERVICE_KEY=... node scripts/migrate-storage.mjs
import { createClient } from '@supabase/supabase-js';

function need(k) {
  const v = process.env[k];
  if (!v) {
    console.error(`환경변수 ${k} 누락`);
    process.exit(1);
  }
  return v;
}

const oldC = createClient(need('OLD_URL'), need('OLD_SERVICE_KEY'));
const newC = createClient(need('NEW_URL'), need('NEW_SERVICE_KEY'));
const BUCKETS = ['notice-images', 'notice-attachments'];

async function listAll(client, bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket} list(${prefix}): ${error.message}`);
    for (const e of data) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) files.push(...(await listAll(client, bucket, p))); // 폴더 재귀
      else files.push({ path: p, meta: e.metadata });
    }
    if (data.length < 1000) break;
  }
  return files;
}

for (const bucket of BUCKETS) {
  const { error } = await newC.storage.createBucket(bucket, { public: true });
  if (error && !/already exists/i.test(error.message)) throw new Error(`${bucket} createBucket: ${error.message}`);

  const files = await listAll(oldC, bucket);
  console.log(`${bucket}: ${files.length}개 파일 복사 시작`);

  for (let i = 0; i < files.length; i += 10) {
    await Promise.all(
      files.slice(i, i + 10).map(async (f) => {
        const { data: blob, error: de } = await oldC.storage.from(bucket).download(f.path);
        if (de) throw new Error(`${bucket}/${f.path} download: ${de.message}`);
        const { error: ue } = await newC.storage.from(bucket).upload(f.path, blob, {
          contentType: f.meta?.mimetype,
          cacheControl: f.meta?.cacheControl ?? '3600',
          upsert: true,
        });
        if (ue) throw new Error(`${bucket}/${f.path} upload: ${ue.message}`);
      })
    );
    console.log(`  ${Math.min(i + 10, files.length)}/${files.length}`);
  }

  const copied = await listAll(newC, bucket);
  const ok = copied.length === files.length ? 'OK' : '!!개수 불일치!!';
  console.log(`${bucket}: 원본 ${files.length} → 복사본 ${copied.length} [${ok}]`);
}
console.log('Storage 이전 완료');
