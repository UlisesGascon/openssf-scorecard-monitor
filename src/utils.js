const got = require('got')
const core = require('@actions/core')
const ejs = require('ejs')
const { readFile, existsSync, mkdirSync } = require('fs').promises
const { join } = require('path')
const { softAssign } = require('@ulisesgascon/soft-assign-deep-property')
const databaseSchema = require('../schemas/database.json')
const scopeSchema = require('../schemas/scope.json')

const Ajv = require('ajv')
const addFormats = require('ajv-formats').default
const ajv = new Ajv()
addFormats(ajv)

const validateAgainstSchema = (schema, name) => (data) => {
  const valid = ajv.validate(schema, data)
  if (!valid) {
    throw new Error(`Check: ${name} file as the file is corrupted. Invalid data: ${ajv.errorsText()}`)
  }
}

const getProjectScore = async ({ platform, org, repo }) => {
  core.debug(`Getting project score for ${platform}/${org}/${repo}`)
  const response = await got(`https://api.securityscorecards.dev/projects/${platform}/${org}/${repo}`)
  const { score, date, repo: { commit } = {} } = JSON.parse(response.body)
  core.debug(`Got project score for ${platform}/${org}/${repo}: ${score} (${date})`)
  return { platform, org, repo, score, date, commit }
}

const getScore = ({ database, platform, org, repo }) => {
  const { current } = database?.[platform]?.[org]?.[repo] || {}
  return current || null
}

const saveScore = ({ database, platform, org, repo, score, date, commit }) => {
  softAssign(database, [platform, org, repo, 'previous'], [])
  const repoRef = database[platform][org][repo]

  if (repoRef.current) {
    repoRef.previous.push(repoRef.current)
  }
  repoRef.current = { score, date, commit }
}

const generateReportUrl = reportTool => (org, repo, commit, prevCommit) => {
  if (reportTool === 'scorecard-visualizer' && !prevCommit) {
    return `https://kooltheba.github.io/openssf-scorecard-api-visualizer/#/projects/github.com/${org}/${repo}/commit/${commit}`
  }
  if (reportTool === 'scorecard-visualizer' && prevCommit) {
    return `https://kooltheba.github.io/openssf-scorecard-api-visualizer/#/projects/github.com/${org}/${repo}/compare/${prevCommit}/${commit}`
  }
  return `https://deps.dev/project/github/${org.toLowerCase()}%2F${repo.toLowerCase()}`
}

const generateReportContent = async ({ scores, reportTagsEnabled, renderBadge, reportTool }) => {
  core.debug('Generating report content')
  const template = await readFile(join(process.cwd(), 'templates/report.ejs'), 'utf8')
  const getReportUrl = generateReportUrl(reportTool)
  return ejs.render(template, { scores, reportTagsEnabled, renderBadge, getReportUrl })
}

const generateIssueContent = async ({ scores, renderBadge, reportTool }) => {
  core.debug('Generating issue content')
  const scoresInScope = scores.filter(({ currentDiff }) => currentDiff)
  if (!scoresInScope.length) {
    return null
  }
  const template = await readFile(join(process.cwd(), 'templates/issue.ejs'), 'utf8')
  const getReportUrl = generateReportUrl(reportTool)
  return ejs.render(template, { scores: scoresInScope, renderBadge, getReportUrl })
}

const makeDirectory = ( path ) => {
  const directories = path.split('/').slice(0, -1).join('/')
  core.debug(`Making directory ${directories}`)
  if (!existsSync(directories)) {
    core.debug('Making directory: ', path)
    mkdirSync(directories, { recursive: true })
  }
}

module.exports = {
  validateDatabaseIntegrity: validateAgainstSchema(databaseSchema, 'database'),
  validateScopeIntegrity: validateAgainstSchema(scopeSchema, 'scope'),
  getProjectScore,
  saveScore,
  getScore,
  generateReportContent,
  generateIssueContent,
  makeDirectory
}
