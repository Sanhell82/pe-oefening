const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Locate repo root directory regardless of whether this script is executed
 * from repo root, .github/autograding, or another directory.
 */
function getRootDir() {
  const candidateFromDirname = path.resolve(__dirname, '../..');
  if (fs.existsSync(path.join(candidateFromDirname, 'package.json'))) {
    return candidateFromDirname;
  }
  const candidateFromCwd = process.cwd();
  if (fs.existsSync(path.join(candidateFromCwd, 'package.json'))) {
    return candidateFromCwd;
  }
  return candidateFromDirname;
}

/**
 * Find workflow file in .github/workflows with case-insensitive search
 * and support for both .yml and .yaml extensions.
 */
function findWorkflowFile(rootDir, baseName) {
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    return null;
  }

  const files = fs.readdirSync(workflowsDir);
  const targetYml = `${baseName}.yml`.toLowerCase();
  const targetYaml = `${baseName}.yaml`.toLowerCase();

  // Try exact match or case-insensitive match (.yml first, then .yaml)
  let found = files.find(f => f.toLowerCase() === targetYml);
  if (!found) {
    found = files.find(f => f.toLowerCase() === targetYaml);
  }

  return found ? path.join(workflowsDir, found) : null;
}

/**
 * Load and parse a workflow YAML file.
 */
function loadWorkflow(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, doc: null, raw: '', error: 'File not found' };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const doc = yaml.load(raw);
    if (!doc || typeof doc !== 'object') {
      return { exists: true, doc: null, raw, error: 'Empty or invalid YAML document' };
    }
    return { exists: true, doc, raw, error: null };
  } catch (err) {
    return { exists: true, doc: null, raw: '', error: err.message };
  }
}

/**
 * Extract all steps from all jobs in a workflow document.
 */
function getAllSteps(doc) {
  if (!doc || typeof doc !== 'object' || !doc.jobs || typeof doc.jobs !== 'object') {
    return [];
  }
  const steps = [];
  for (const jobKey of Object.keys(doc.jobs)) {
    const job = doc.jobs[jobKey];
    if (job && Array.isArray(job.steps)) {
      for (const step of job.steps) {
        if (step && typeof step === 'object') {
          steps.push(step);
        }
      }
    }
  }
  return steps;
}

/**
 * Extract trigger configuration from workflow document.
 * Handles YAML 1.1 / 1.2 differences (where 'on' might be parsed as boolean true).
 */
function getOnTrigger(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.on !== undefined) return doc.on;
  if (doc['true'] !== undefined) return doc['true'];
  return null;
}

// -------------------------------------------------------------
// Quality workflow checks (.github/workflows/quality.yml)
// -------------------------------------------------------------

function checkQualityTriggerPullRequest(doc, raw) {
  const on = getOnTrigger(doc);
  if (on) {
    if (typeof on === 'string' && /pull_request/i.test(on)) return true;
    if (Array.isArray(on) && on.some(t => typeof t === 'string' && /pull_request/i.test(t))) return true;
    if (typeof on === 'object') {
      for (const key of Object.keys(on)) {
        if (/pull_request/i.test(key)) return true;
      }
    }
  }
  return /\bon\s*:[\s\S]*?\bpull_request\b/i.test(raw);
}

function checkCheckoutStep(steps, raw) {
  const hasStep = steps.some(step => step.uses && /actions\/checkout/i.test(step.uses));
  return hasStep || /uses\s*:\s*actions\/checkout/i.test(raw);
}

function checkInstallDependencies(steps, raw) {
  const hasStep = steps.some(step => {
    if (!step.run) return false;
    return /\bnpm\s+(install|ci|i)\b/i.test(step.run);
  });
  return hasStep || /\bnpm\s+(install|ci|i)\b/i.test(raw);
}

function checkEslint(steps, raw) {
  const hasStep = steps.some(step => {
    if (!step.run) return false;
    return /\bnpm\s+run\s+lint\b|\bnpx\s+eslint\b|\beslint\s+/i.test(step.run);
  });
  return hasStep || /\bnpm\s+run\s+lint\b|\bnpx\s+eslint\b|\beslint\s+/i.test(raw);
}

function checkUnittests(steps, raw) {
  const hasStep = steps.some(step => {
    if (!step.run) return false;
    return /\bnpm\s+(test|t|run\s+test)\b|\bnpx\s+jest\b|\bjest\b/i.test(step.run);
  });
  return hasStep || /\bnpm\s+(test|t|run\s+test)\b|\bnpx\s+jest\b|\bjest\b/i.test(raw);
}

function checkTestReport(steps, raw) {
  const reporterActionRegex = /(actions\/upload-artifact|dorny\/test-reporter|mikepenz\/action-junit-report|publish-unit-test-result-action|surefire-report|action-junit)/i;
  const genericReporterRegex = /(test-report|junit-report|action-junit|publish-unit-test|test-results)/i;

  const hasStep = steps.some(step => {
    if (step.uses && (reporterActionRegex.test(step.uses) || genericReporterRegex.test(step.uses))) {
      return true;
    }
    const stepStr = JSON.stringify(step);
    if (/junit\.xml/i.test(stepStr) && (reporterActionRegex.test(stepStr) || genericReporterRegex.test(stepStr) || /artifact/i.test(stepStr))) {
      return true;
    }
    return false;
  });

  return hasStep || reporterActionRegex.test(raw) || (genericReporterRegex.test(raw) && /junit/i.test(raw));
}

// -------------------------------------------------------------
// CI workflow checks (.github/workflows/ci.yml)
// -------------------------------------------------------------

function checkCiTriggerPushMain(doc, raw) {
  const on = getOnTrigger(doc);
  if (on) {
    if (typeof on === 'string' && on.toLowerCase() === 'push') return true;
    if (Array.isArray(on) && on.some(t => typeof t === 'string' && t.toLowerCase() === 'push')) return true;
    if (typeof on === 'object' && on.push !== undefined) {
      const pushConfig = on.push;
      if (!pushConfig || typeof pushConfig !== 'object') return true;
      if (pushConfig.branches) {
        const branches = Array.isArray(pushConfig.branches) ? pushConfig.branches : [pushConfig.branches];
        if (branches.some(b => typeof b === 'string' && /main/i.test(b))) return true;
      } else {
        return true;
      }
    }
  }
  return /\bpush\s*:[\s\S]*?\bmain\b/i.test(raw) || /\bon\s*:[\s\S]*?\bpush\b/i.test(raw);
}

function checkCiTriggerWorkflowDispatch(doc, raw) {
  const on = getOnTrigger(doc);
  if (on) {
    if (typeof on === 'string' && /workflow_dispatch/i.test(on)) return true;
    if (Array.isArray(on) && on.some(t => typeof t === 'string' && /workflow_dispatch/i.test(t))) return true;
    if (typeof on === 'object') {
      for (const key of Object.keys(on)) {
        if (/workflow_dispatch/i.test(key)) return true;
      }
    }
  }
  return /\bworkflow_dispatch\b/i.test(raw);
}

function checkBuildDockerImage(steps, raw) {
  const hasStep = steps.some(step => {
    if (step.run) {
      return /\bdocker\s+(buildx\s+build|build)\b/i.test(step.run);
    }
    if (step.uses && /docker\/build-push-action/i.test(step.uses)) {
      return true;
    }
    return false;
  });

  return hasStep || /\bdocker\s+(buildx\s+build|build)\b/i.test(raw) || /docker\/build-push-action/i.test(raw);
}

function checkCommitShaTag(steps, raw) {
  const shaRegex = /(github\.sha|github_sha|\$GITHUB_SHA|\${GITHUB_SHA)/i;
  const hasStep = steps.some(step => {
    if (step.run && shaRegex.test(step.run)) return true;
    if (step.with && shaRegex.test(JSON.stringify(step.with))) return true;
    if (step.env && shaRegex.test(JSON.stringify(step.env))) return true;
    return false;
  });

  return hasStep || shaRegex.test(raw);
}

function checkSecretsUsage(steps, raw) {
  return /secrets\.[a-zA-Z0-9_]+/i.test(raw);
}

function checkPushDockerImage(steps, raw) {
  const hasLoginAction = steps.some(step => step.uses && /docker\/login-action/i.test(step.uses)) || /docker\/login-action/i.test(raw);
  const hasLoginCmd = steps.some(step => step.run && /\bdocker\s+login\b/i.test(step.run)) || /\bdocker\s+login\b/i.test(raw);
  const hasLogin = hasLoginAction || hasLoginCmd;

  const hasPushCmd = steps.some(step => step.run && /\bdocker\s+push\b/i.test(step.run)) || /\bdocker\s+push\b/i.test(raw);
  const hasBuildPushAction = steps.some(step => {
    if (step.uses && /docker\/build-push-action/i.test(step.uses)) {
      if (step.with && (step.with.push === true || step.with.push === 'true')) {
        return true;
      }
    }
    return false;
  }) || (/docker\/build-push-action/i.test(raw) && /push\s*:\s*true/i.test(raw));
  const hasPush = hasPushCmd || hasBuildPushAction;

  return hasLogin && hasPush;
}

// -------------------------------------------------------------
// GitHub API checks for Open PR & Workflow execution
// -------------------------------------------------------------

/**
 * Detect GitHub repository in owner/repo format.
 * Checks process.env.GITHUB_REPOSITORY first, then falls back to git remote origin.
 */
function getRepoFullName() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }
  try {
    const { execSync } = require('child_process');
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  } catch {
    // Ignore git error
  }
  return null;
}

/**
 * Check if an open PR exists, if the quality workflow was triggered on it,
 * and if the last runs of ci.yml and quality.yml succeeded.
 */
async function checkGitHubPrAndWorkflow(repoFullName = getRepoFullName(), token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
  if (!repoFullName || !token) {
    return {
      hasOpenPr: false,
      workflowExecutedOnPr: false,
      lastCiWorkflowSuccessful: false,
      lastQualityWorkflowSuccessful: false,
      skipped: true,
      reason: !token ? 'GITHUB_TOKEN not provided' : 'Repository not determined'
    };
  }

  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Autograding-Script',
    'X-GitHub-Api-Version': '2022-11-28',
    'Authorization': `Bearer ${token}`
  };

  /**
   * Helper to wait for a workflow run if it is currently queued or in-progress.
   */
  async function waitForRunCompletion(run, workflowName) {
    if (!run) return null;
    if (run.status === 'completed') return run.conclusion;

    console.log(`${workflowName} run #${run.run_number || run.id} is currently ${run.status}. Waiting for it to finish...`);
    const startTime = Date.now();
    const maxWaitMs = 180000; // up to 3 minutes
    const pollIntervalMs = 10000; // poll every 10 seconds

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      try {
        const singleRunRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runs/${run.id}`, { headers });
        if (singleRunRes.ok) {
          const runData = await singleRunRes.json();
          if (runData.status === 'completed') {
            console.log(`${workflowName} run #${run.run_number || run.id} completed with conclusion: ${runData.conclusion}`);
            return runData.conclusion;
          } else {
            console.log(`Still waiting for ${workflowName} run #${run.run_number || run.id}... (${runData.status})`);
          }
        }
      } catch {
        // Ignore fetch errors during polling
      }
    }
    return null;
  }

  try {
    let hasOpenPr = false;
    let workflowExecutedOnPr = false;
    let lastCiWorkflowSuccessful = false;
    let lastQualityWorkflowSuccessful = false;

    // 1. Fetch open Pull Requests
    let headSha = null;
    let headRef = null;
    let prNumber = null;

    try {
      const pullsRes = await fetch(`https://api.github.com/repos/${repoFullName}/pulls?state=open&sort=created&direction=desc&per_page=10`, { headers });
      if (pullsRes.ok) {
        const pulls = await pullsRes.json();
        if (Array.isArray(pulls) && pulls.length > 0) {
          hasOpenPr = true;
          const latestPr = pulls[0];
          headSha = latestPr.head && latestPr.head.sha;
          headRef = latestPr.head && latestPr.head.ref;
          prNumber = latestPr.number;
        }
      }
    } catch {
      // Ignore pulls fetch error
    }

    // Check Option A: Check runs on the head commit of the PR
    if (headSha) {
      try {
        const checkRunsRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${headSha}/check-runs`, { headers });
        if (checkRunsRes.ok) {
          const checkData = await checkRunsRes.json();
          if (Array.isArray(checkData.check_runs) && checkData.check_runs.length > 0) {
            workflowExecutedOnPr = true;
            if (checkData.check_runs.some(cr => cr.status === 'completed' && cr.conclusion === 'success')) {
              lastQualityWorkflowSuccessful = true;
            }
          }
        }
      } catch {
        // Fallback to Option B
      }
    }

    // 2. Fetch Workflow runs (for PR execution, CI workflow success, and Quality workflow success)
    try {
      const runsRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runs?per_page=50`, { headers });
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const runs = runsData.workflow_runs || [];

        // Check PR execution if not yet confirmed
        if (!workflowExecutedOnPr && hasOpenPr) {
          const matchingRun = runs.find(run => {
            const matchesPrNumber = Array.isArray(run.pull_requests) && run.pull_requests.some(p => p.number === prNumber);
            const matchesSha = headSha && run.head_sha === headSha;
            const matchesBranch = headRef && run.head_branch === headRef;
            const isQualityOrPr = /quality/i.test(run.name || '') || /quality/i.test(run.path || '') || run.event === 'pull_request';

            return (matchesPrNumber || matchesSha || matchesBranch) && isQualityOrPr;
          });

          if (matchingRun) {
            workflowExecutedOnPr = true;
          }
        }

        // Check if the last CI workflow run was successful
        let ciRuns = runs.filter(run => {
          const isCiPath = run.path && /ci\.ya?ml$/i.test(run.path);
          const isCiName = run.name && /\bci\b/i.test(run.name) && !/quality/i.test(run.name);
          return isCiPath || isCiName;
        });

        // If no CI runs found yet, wait briefly and retry in case GitHub is still queuing it
        if (ciRuns.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          try {
            const retryRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runs?per_page=50`, { headers });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              const retryRuns = retryData.workflow_runs || [];
              ciRuns = retryRuns.filter(run => {
                const isCiPath = run.path && /ci\.ya?ml$/i.test(run.path);
                const isCiName = run.name && /\bci\b/i.test(run.name) && !/quality/i.test(run.name);
                return isCiPath || isCiName;
              });
            }
          } catch {
            // Ignore retry error
          }
        }

        if (ciRuns.length > 0) {
          const latestCiRun = ciRuns[0];
          const conclusion = await waitForRunCompletion(latestCiRun, 'ci.yml');
          if (conclusion === 'success') {
            lastCiWorkflowSuccessful = true;
          }
          if (!lastCiWorkflowSuccessful && ciRuns.some(r => r.status === 'completed' && r.conclusion === 'success')) {
            lastCiWorkflowSuccessful = true;
          }
        }

        // Check if the last Quality workflow run was successful
        const qualityRuns = runs.filter(run => {
          const isQualityPath = run.path && /quality\.ya?ml$/i.test(run.path);
          const isQualityName = run.name && /quality/i.test(run.name);
          return isQualityPath || isQualityName;
        });

        if (qualityRuns.length > 0) {
          const latestQualityRun = qualityRuns[0];
          const conclusion = await waitForRunCompletion(latestQualityRun, 'quality.yml');
          if (conclusion === 'success') {
            lastQualityWorkflowSuccessful = true;
          }
          if (!lastQualityWorkflowSuccessful && qualityRuns.some(r => r.status === 'completed' && r.conclusion === 'success')) {
            lastQualityWorkflowSuccessful = true;
          }
        }
      }
    } catch {
      // Ignore workflow runs fetch error
    }

    return {
      hasOpenPr,
      workflowExecutedOnPr,
      lastCiWorkflowSuccessful,
      lastQualityWorkflowSuccessful
    };
  } catch (err) {
    return {
      hasOpenPr: false,
      workflowExecutedOnPr: false,
      lastCiWorkflowSuccessful: false,
      lastQualityWorkflowSuccessful: false,
      error: err.message
    };
  }
}

// -------------------------------------------------------------
// Main grading function
// -------------------------------------------------------------

async function gradeWorkflows(rootDir = getRootDir(), options = {}) {
  const results = [];

  const ghResults = (options.ghResults !== undefined ? options.ghResults : options.prResults) !== undefined
    ? (options.ghResults !== undefined ? options.ghResults : options.prResults)
    : await checkGitHubPrAndWorkflow(options.repoFullName, options.token);

  // 1. Grade quality.yml
  const qualityFile = findWorkflowFile(rootDir, 'quality');
  const quality = loadWorkflow(qualityFile);
  const qualitySteps = quality.doc ? getAllSteps(quality.doc) : [];

  const qualityExists = quality.exists && quality.doc !== null && quality.doc.jobs !== undefined;
  results.push({ name: 'quality.yml - Triggered on pull request', score: qualityExists && checkQualityTriggerPullRequest(quality.doc, quality.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'quality.yml - Checked out code', score: qualityExists && checkCheckoutStep(qualitySteps, quality.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'quality.yml - Installed dependencies', score: qualityExists && checkInstallDependencies(qualitySteps, quality.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'quality.yml - Checked code quality (ESLint)', score: qualityExists && checkEslint(qualitySteps, quality.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'quality.yml - Ran unittests', score: qualityExists && checkUnittests(qualitySteps, quality.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'quality.yml - Created unittest report', score: qualityExists && checkTestReport(qualitySteps, quality.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'quality.yml - Last workflow run succeeded', score: ghResults.lastQualityWorkflowSuccessful ? 2 : 0, maxScore: 2 });

  // 2. Grade ci.yml
  const ciFile = findWorkflowFile(rootDir, 'ci');
  const ci = loadWorkflow(ciFile);
  const ciSteps = ci.doc ? getAllSteps(ci.doc) : [];

  const ciExists = ci.exists && ci.doc !== null && ci.doc.jobs !== undefined;
  results.push({ name: 'ci.yml - Triggered on push to main', score: ciExists && checkCiTriggerPushMain(ci.doc, ci.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'ci.yml - Triggered on workflow_dispatch', score: ciExists && checkCiTriggerWorkflowDispatch(ci.doc, ci.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'ci.yml - Checked out code', score: ciExists && checkCheckoutStep(ciSteps, ci.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'ci.yml - Built docker image', score: ciExists && checkBuildDockerImage(ciSteps, ci.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'ci.yml - Tagged docker image with commit SHA', score: ciExists && checkCommitShaTag(ciSteps, ci.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'ci.yml - Used secrets for credentials', score: ciExists && checkSecretsUsage(ciSteps, ci.raw) ? 2 : 0, maxScore: 2 });
  results.push({ name: 'ci.yml - Pushed docker image', score: ciExists && checkPushDockerImage(ciSteps, ci.raw) ? 1 : 0, maxScore: 1 });
  results.push({ name: 'ci.yml - Last workflow run succeeded', score: ghResults.lastCiWorkflowSuccessful ? 2 : 0, maxScore: 2 });

  // 3. Grade PR & GitHub Actions execution
  results.push({ name: 'PR - Open pull request exists', score: ghResults.hasOpenPr ? 1 : 0, maxScore: 1 });
  results.push({ name: 'PR - Quality workflow executed on PR', score: ghResults.workflowExecutedOnPr ? 1 : 0, maxScore: 1 });

  return results;
}

function writeStepSummary(results, totalScore, maxScore) {
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  let md = `## 📊 Autograding Result: **${totalScore} / ${maxScore}** (${percentage}%)\n\n`;
  md += `| Category | Check | Status | Score |\n`;
  md += `| :--- | :--- | :---: | :---: |\n`;

  for (const item of results) {
    const itemMax = item.maxScore !== undefined ? item.maxScore : 1;
    const icon = item.score > 0 ? (item.score === itemMax ? '✅ Passed' : '⚠️ Partial') : '❌ Failed';
    const parts = item.name.split(' - ');
    const category = parts.length > 1 ? parts[0] : 'General';
    const checkName = parts.length > 1 ? parts.slice(1).join(' - ') : item.name;

    md += `| **${category}** | ${checkName} | ${icon} | **${item.score}** / ${itemMax} |\n`;
  }

  md += `| **Total** | | | **${totalScore} / ${maxScore}** (${percentage}%) |\n\n`;

  // Write to GitHub Actions workflow run dashboard (Job Summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md, 'utf8');
    } catch (err) {
      console.error('Failed to write to GITHUB_STEP_SUMMARY:', err);
    }
  }

  // Write GitHub Actions notice annotation (visible on commit & workflow summary header)
  console.log(`::notice title=Autograding Score::Final Score: ${totalScore}/${maxScore} (${percentage}%)`);
}

async function run() {
  const results = await gradeWorkflows();
  let totalScore = 0;
  let maxScore = 0;

  for (const item of results) {
    const itemMax = item.maxScore !== undefined ? item.maxScore : 1;
    totalScore += item.score;
    maxScore += itemMax;
    console.log(`${item.name}: ${item.score}/${itemMax}`);
  }

  console.log(`Total: ${totalScore}/${maxScore}`);

  writeStepSummary(results, totalScore, maxScore);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Autograding error:', err);
    process.exit(1);
  });
}

module.exports = {
  gradeWorkflows,
  checkGitHubPrAndWorkflow,
  run,
  getRootDir,
  getRepoFullName,
  findWorkflowFile,
  loadWorkflow,
  getAllSteps,
  checkBuildDockerImage,
  checkCommitShaTag,
  checkSecretsUsage,
  checkPushDockerImage,
  writeStepSummary
};
