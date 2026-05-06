import { appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const msg = process.argv.slice(2).join(' ').trim() || 'checkpoint'

let hash
try {
  hash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim()
} catch {
  console.error('git rev-parse 실패: 저장소가 아니거나 git이 없습니다.')
  process.exit(1)
}

const line = `${new Date().toISOString()} ${hash} ${msg}\n`
appendFileSync(join(root, 'history'), line)
console.log(line.trim())
