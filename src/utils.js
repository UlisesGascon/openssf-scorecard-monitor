const got = require('got')
const debug = require('debug')('openssf-scorecard-monitor')
const db = require('../data/database')
const { writeFile } = require('fs').promises

const updateDatabase = async () => {
  debug('Updating database')
  await writeFile('./data/database.json', JSON.stringify(db, null, 2))
  debug('Database updated')
}

function spliceIntoChunks (arr, chunkSize) {
  // @see: https://stackabuse.com/how-to-split-an-array-into-even-chunks-in-javascript/
  const res = []
  while (arr.length > 0) {
    const chunk = arr.splice(0, chunkSize)
    res.push(chunk)
  }
  return res
}

const softAssign = (obj, keyPath, value) => {
  // @see: https://stackoverflow.com/a/5484764
  const lastKeyIndex = keyPath.length - 1
  for (let i = 0; i < lastKeyIndex; ++i) {
    const key = keyPath[i]
    if (!(key in obj)) {
      obj[key] = {}
    }
    obj = obj[key]
  }
  obj[keyPath[lastKeyIndex]] = obj[keyPath[lastKeyIndex]] || value
}

const getProjectScore = async ({ platform, org, repo }) => {
  debug('Getting project score for %s/%s/%s', platform, org, repo)
  const response = await got(`https://api.securityscorecards.dev/projects/${platform}/${org}/${repo}`)
  const { score, date } = JSON.parse(response.body)
  debug('Got project score for %s/%s/%s: %s (%s)', platform, org, repo, score, date)
  return { platform, org, repo, score, date }
}

const getScore = ({ platform, org, repo }) => {
  const { current } = db?.[platform]?.[org]?.[repo] || {}
  return current || null
}

const saveScore = ({ platform, org, repo, score, date }) => {
  softAssign(db, [platform, org, repo, 'previous'], [])
  const repoRef = db[platform][org][repo]

  if (repoRef.current) {
    repoRef.previous.push(repoRef.current)
  }
  repoRef.current = { score, date }
}

module.exports = {
  getProjectScore,
  saveScore,
  getScore,
  spliceIntoChunks,
  updateDatabase
}