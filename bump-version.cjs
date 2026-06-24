const fs = require('node:fs')
const path = require('node:path')

const packageJsonPath = path.join(__dirname, 'package.json')
const raw = fs.readFileSync(packageJsonPath, 'utf8')
const pkg = JSON.parse(raw)

if (typeof pkg.version !== 'string') {
  throw new Error('package.json 缺少 version 字段')
}

const match = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/)
if (!match) {
  throw new Error(`version 格式无效: ${pkg.version}`)
}

const major = Number(match[1])
const minor = Number(match[2])
const patch = Number(match[3])

let nextVersion
if (major < 1) {
  nextVersion = '1.0.0'
} else {
  nextVersion = `${major}.${minor}.${patch + 1}`
}

pkg.version = nextVersion
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
console.log(`version bumped: ${match[0]} -> ${nextVersion}`)
