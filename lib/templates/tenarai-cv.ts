// Brand tokens — do not inline these values elsewhere; update here only.
const CARBON = '#000000'
const WHITE = '#FFFFFF'
const CHARCOAL = '#2F2C29'
const WARM_GRAY = '#5E5751'
const LIGHT_BORDER = '#E5E0D8'
const VOLT = '#8CF000'
const FONT = 'Arial, Helvetica, sans-serif'

// Caret SVG (black, for top-right corner per brand guidelines)
const CARET_SVG = `<svg width="20" height="22" viewBox="0 0 82 84" fill="${CARBON}" xmlns="http://www.w3.org/2000/svg"><path d="M0,1.4028496v40.920418h40.920418v40.920418h40.920418V1.4028496H0Z"/></svg>`

// Logo wordmark (caret + "Tenarai", black, for footer per brand guidelines)
const LOGO_SVG = `<div style="display:flex;align-items:center;gap:6px;"><svg width="14" height="15" viewBox="0 0 82 84" fill="${CARBON}" xmlns="http://www.w3.org/2000/svg"><path d="M0,1.4028496v40.920418h40.920418v40.920418h40.920418V1.4028496H0Z"/></svg><span style="font-family:${FONT};font-weight:700;font-size:12px;color:${CARBON};">Tenarai</span></div>`

export type SkillCategory = 'Languages' | 'Frameworks' | 'Cloud & DevOps' | 'AI & Data' | 'Methodologies' | 'Soft Skills' | 'Other'

// "Languages" = programming and scripting languages only (spoken languages have their own CV section).
// Cloud platforms go under Cloud & DevOps; Scrum/Agile/Kanban etc. under Methodologies (not Soft Skills).
const SKILL_CATEGORY_MAP: Record<string, SkillCategory> = {
  // Languages (programming / scripting)
  python: 'Languages', go: 'Languages', golang: 'Languages', java: 'Languages', javascript: 'Languages',
  typescript: 'Languages', sql: 'Languages', 'c#': 'Languages', ruby: 'Languages', c: 'Languages',
  php: 'Languages', rust: 'Languages', swift: 'Languages', kotlin: 'Languages', perl: 'Languages',
  scala: 'Languages', 'c++': 'Languages', bash: 'Languages', shell: 'Languages', 'shell scripting': 'Languages',
  powershell: 'Languages', 'pl/sql': 'Languages', 't-sql': 'Languages', vba: 'Languages', r: 'Languages',
  dart: 'Languages', 'objective-c': 'Languages', groovy: 'Languages', lua: 'Languages', elixir: 'Languages',
  // Frameworks & Libraries
  'node.js': 'Frameworks', nodejs: 'Frameworks', django: 'Frameworks', flask: 'Frameworks', spring: 'Frameworks',
  'express.js': 'Frameworks', express: 'Frameworks', react: 'Frameworks', 'react native': 'Frameworks',
  'next.js': 'Frameworks', fastapi: 'Frameworks', rails: 'Frameworks', 'ruby on rails': 'Frameworks',
  laravel: 'Frameworks', angular: 'Frameworks', vue: 'Frameworks', 'vue.js': 'Frameworks', graphql: 'Frameworks',
  'spring boot': 'Frameworks', 'spring data': 'Frameworks', 'spring security': 'Frameworks',
  'spring test': 'Frameworks', junit: 'Frameworks', 'junit 5': 'Frameworks', mockito: 'Frameworks',
  hibernate: 'Frameworks', '.net': 'Frameworks', 'asp.net': 'Frameworks', '.net core': 'Frameworks',
  flutter: 'Frameworks', jquery: 'Frameworks', selenium: 'Frameworks', cypress: 'Frameworks', jest: 'Frameworks',
  // Cloud & DevOps (platforms, infrastructure, tooling)
  aws: 'Cloud & DevOps', 'amazon web services': 'Cloud & DevOps', azure: 'Cloud & DevOps', 'microsoft azure': 'Cloud & DevOps',
  gcp: 'Cloud & DevOps', 'google cloud': 'Cloud & DevOps', 'google cloud platform': 'Cloud & DevOps', 'oracle cloud': 'Cloud & DevOps',
  kubernetes: 'Cloud & DevOps', docker: 'Cloud & DevOps', openshift: 'Cloud & DevOps',
  'ci/cd': 'Cloud & DevOps', git: 'Cloud & DevOps', github: 'Cloud & DevOps', gitlab: 'Cloud & DevOps', terraform: 'Cloud & DevOps',
  ansible: 'Cloud & DevOps', jenkins: 'Cloud & DevOps', 'github actions': 'Cloud & DevOps', 'azure devops': 'Cloud & DevOps',
  'docker compose': 'Cloud & DevOps', helm: 'Cloud & DevOps', linux: 'Cloud & DevOps', 'windows server': 'Cloud & DevOps',
  'kubernetes operators': 'Cloud & DevOps', prometheus: 'Cloud & DevOps', grafana: 'Cloud & DevOps',
  datadog: 'Cloud & DevOps', nginx: 'Cloud & DevOps', 'observability tools': 'Cloud & DevOps',
  microservices: 'Cloud & DevOps', maven: 'Cloud & DevOps', devops: 'Cloud & DevOps', vmware: 'Cloud & DevOps',
  'active directory': 'Cloud & DevOps', 'office 365': 'Cloud & DevOps', 'microsoft 365': 'Cloud & DevOps',
  // AI & Data
  'llm automation': 'AI & Data', 'ai-assisted scripting': 'AI & Data',
  postgresql: 'AI & Data', mongodb: 'AI & Data', mysql: 'AI & Data', 'sql server': 'AI & Data', oracle: 'AI & Data',
  redis: 'AI & Data', elasticsearch: 'AI & Data', kafka: 'AI & Data', snowflake: 'AI & Data', databricks: 'AI & Data',
  spark: 'AI & Data', 'machine learning': 'AI & Data', tensorflow: 'AI & Data', 'power bi': 'AI & Data', tableau: 'AI & Data',
  pytorch: 'AI & Data', pandas: 'AI & Data', 'data engineering': 'AI & Data', etl: 'AI & Data',
  // Methodologies
  scrum: 'Methodologies', agile: 'Methodologies', kanban: 'Methodologies', itil: 'Methodologies', safe: 'Methodologies',
  lean: 'Methodologies', waterfall: 'Methodologies', tdd: 'Methodologies', bdd: 'Methodologies', 'design thinking': 'Methodologies',
  'six sigma': 'Methodologies', prince2: 'Methodologies', pmp: 'Methodologies',
  // Soft Skills
  'incident response': 'Soft Skills', 'team collaboration': 'Soft Skills', teamwork: 'Soft Skills',
  ownership: 'Soft Skills', 'on-call operations': 'Soft Skills', 'problem solving': 'Soft Skills',
  leadership: 'Soft Skills', communication: 'Soft Skills', mentoring: 'Soft Skills', 'customer service': 'Soft Skills',
}

const CATEGORY_ORDER: SkillCategory[] = ['Languages', 'Frameworks', 'Cloud & DevOps', 'AI & Data', 'Methodologies', 'Soft Skills', 'Other']

// Words of a skill name; keeps + # . / - inside words so c++, c#, node.js, ci/cd and t-sql stay whole
function skillWords(s: string): string[] {
  return s.toLowerCase().split(/[\s,()]+/).map((w) => w.replace(/^[^a-z0-9.#+]+|[^a-z0-9#+]+$/g, '')).filter(Boolean)
}

// Fallback keys, longest first (so "spring boot" wins over "spring", "azure devops" over "azure").
// Keys shorter than 3 characters ("go", "c", "r") only match exactly — never inside other skill names.
const FALLBACK_KEYS = Object.keys(SKILL_CATEGORY_MAP)
  .filter((k) => k.length >= 3)
  .map((k) => ({ key: k, words: skillWords(k) }))
  .sort((a, b) => b.words.length - a.words.length || b.key.length - a.key.length)

export function categorizeSkill(skill: string): SkillCategory {
  const lower = (skill ?? '').toLowerCase().trim()
  if (!lower) return 'Other'
  if (SKILL_CATEGORY_MAP[lower]) return SKILL_CATEGORY_MAP[lower]
  // Whole-word fallback: a known key appears as a contiguous word sequence in the skill ("Scrum Master" → scrum)
  const words = skillWords(lower)
  for (const { key, words: kw } of FALLBACK_KEYS) {
    for (let i = 0; i + kw.length <= words.length; i++) {
      if (kw.every((w, j) => words[i + j] === w)) return SKILL_CATEGORY_MAP[key]
    }
  }
  return 'Other'
}

export interface CvExperienceEntry {
  title: string
  company: string
  startDate: string
  endDate: string
  bullets: string[]
}

export interface CvEducationEntry {
  degree: string
  institution: string
  year?: string
}

export interface TenoraiCvData {
  anonymizedName: string
  positionTitle: string
  country: string | null
  seniority: string | null
  yearsOfExperience: number | null
  // Availability to start label (e.g. "2 weeks"); line shown only when set
  availability?: string | null
  summary: string | null
  skills: string[]
  matchingSkillSet: Set<string>
  languages: string[]
  experience: CvExperienceEntry[]
  education: CvEducationEntry[]
}

function sectionHeader(title: string): string {
  return `
    <div style="display:flex;align-items:center;gap:12px;margin:28px 0 14px 0;">
      <span style="font-family:${FONT};font-size:10px;font-weight:800;color:${CARBON};text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">${title}</span>
      <div style="flex:1;border-top:1px solid ${LIGHT_BORDER};"></div>
    </div>`
}

function skillChip(skill: string, matching: boolean): string {
  if (matching) {
    return `<span style="display:inline-block;background:${CARBON};color:${VOLT};font-weight:700;font-size:11px;padding:2px 8px;border-radius:3px;margin:2px 4px 2px 0;font-family:${FONT};">${esc(skill)}</span>`
  }
  return `<span style="display:inline-block;color:${CHARCOAL};font-size:13px;margin:2px 8px 2px 0;font-family:${FONT};">${esc(skill)}</span>`
}

function esc(s: unknown): string {
  return (typeof s === 'string' ? s : s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderSkillsSection(skills: string[], matchingSkillSet: Set<string>): string {
  skills = (skills ?? []).filter((s) => typeof s === 'string' && s.trim())
  if (skills.length === 0) return ''

  const grouped = new Map<SkillCategory, string[]>()
  for (const skill of skills) {
    const cat = categorizeSkill(skill)
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(skill)
  }

  const rows = CATEGORY_ORDER
    .filter((cat) => grouped.has(cat))
    .map((cat) => {
      const catSkills = grouped.get(cat)!
      const chips = catSkills.map((s) => skillChip(s, matchingSkillSet.has(s.toLowerCase()))).join('')
      return `
        <div style="margin-bottom:10px;">
          <span style="font-family:${FONT};font-size:11px;font-weight:600;color:${WARM_GRAY};display:block;margin-bottom:5px;">${cat}</span>
          <div>${chips}</div>
        </div>`
    })
    .join('')

  if (!rows) return ''
  return sectionHeader('Core Skills') + rows
}

function renderExperienceSection(experience: CvExperienceEntry[]): string {
  if (!experience?.length) {
    return sectionHeader('Professional Experience') +
      `<p style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};font-style:italic;margin:0;">Detailed experience available upon request.</p>`
  }

  const blocks = experience.map((e) => {
    const list = Array.isArray(e.bullets) ? e.bullets.filter(Boolean) : []
    const dates = [e.startDate, e.endDate].filter(Boolean).map(esc).join(' – ')
    const bullets = list.length > 0
      ? `<ul style="margin:6px 0 0 0;padding-left:18px;color:${CHARCOAL};font-size:13px;line-height:1.65;font-family:${FONT};">${list.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
      : ''
    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;">
          <span style="font-family:${FONT};font-size:14px;font-weight:700;color:${CARBON};">${esc(e.title)}</span>
          <span style="font-family:${FONT};font-size:12px;color:${WARM_GRAY};white-space:nowrap;">${dates}</span>
        </div>
        <span style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};font-style:italic;display:block;margin-top:1px;">${esc(e.company)}</span>
        ${bullets}
      </div>`
  }).join('')

  return sectionHeader('Professional Experience') + blocks
}

function renderEducationSection(education: CvEducationEntry[]): string {
  if (!education?.length) return ''
  const rows = education.map((e) => `
    <div style="margin-bottom:10px;">
      <span style="font-family:${FONT};font-size:14px;font-weight:700;color:${CARBON};">${esc(e.degree)}</span>
      <span style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};display:block;margin-top:1px;">${esc(e.institution)}${e.year ? ` · ${esc(e.year)}` : ''}</span>
    </div>`).join('')
  return sectionHeader('Education') + rows
}

export function renderTenoraiCv(data: TenoraiCvData): string {
  const { anonymizedName, positionTitle, country, yearsOfExperience, availability, summary, skills, matchingSkillSet, languages, experience, education } = data

  const subtitle = [
    country,
    `Applying for: ${positionTitle}`,
    yearsOfExperience != null ? `${yearsOfExperience}+ years of experience` : null,
  ].filter(Boolean).join(' | ')

  const summaryHtml = summary
    ? sectionHeader('Professional Summary') +
      `<p style="font-family:${FONT};font-size:14px;line-height:1.7;color:${CHARCOAL};margin:0 0 4px 0;">${esc(summary)}</p>`
    : ''

  const languagesHtml = languages?.length
    ? sectionHeader('Languages') +
      `<p style="font-family:${FONT};font-size:13px;color:${CHARCOAL};margin:0;">${languages.map(esc).join(' · ')}</p>`
    : ''

  const skillsHtml = renderSkillsSection(skills, matchingSkillSet)
  const experienceHtml = renderExperienceSection(experience)
  const educationHtml = renderEducationSection(education)

  const toolbar = `
    <div class="toolbar" style="position:fixed;top:0;left:0;right:0;z-index:999;background:${CARBON};display:flex;align-items:center;justify-content:space-between;padding:10px 24px;font-family:${FONT};">
      <span style="color:${VOLT};font-size:13px;font-weight:600;letter-spacing:1px;">Tenarai LATAM · CV Preview</span>
      <button onclick="window.print()" style="background:${VOLT};color:${CARBON};border:none;padding:7px 18px;border-radius:4px;font-weight:700;font-size:13px;cursor:pointer;font-family:${FONT};">Download PDF</button>
    </div>
    <div class="toolbar-spacer" style="height:44px;"></div>`

  const footer = `
    <div style="margin-top:48px;padding-top:16px;border-top:1px solid ${LIGHT_BORDER};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      ${LOGO_SVG}
      <span style="font-family:${FONT};font-size:11px;color:${WARM_GRAY};">Confidential — Presented by Tenarai LATAM</span>
    </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CV — ${esc(anonymizedName)} | Tenarai LATAM</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${WHITE}; }
  @media print {
    .toolbar, .toolbar-spacer { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${toolbar}
<div style="max-width:780px;margin:0 auto;padding:48px 56px;background:${WHITE};">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
    <div>
      <h1 style="font-family:${FONT};font-size:30px;font-weight:800;color:${CARBON};margin:0 0 8px 0;">${esc(anonymizedName)}</h1>
      <p style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};font-style:italic;margin:0;">${esc(subtitle)}</p>
      ${availability ? `<p style="font-family:${FONT};font-size:13px;color:${CHARCOAL};margin:6px 0 0 0;"><strong>Availability:</strong> ${esc(availability)}</p>` : ''}
    </div>
    <div style="flex-shrink:0;margin-top:4px;">${CARET_SVG}</div>
  </div>

  <div style="border-top:1px solid ${LIGHT_BORDER};margin-bottom:4px;"></div>

  ${summaryHtml}
  ${skillsHtml}
  ${experienceHtml}
  ${educationHtml}
  ${languagesHtml}

  ${footer}
</div>
</body>
</html>`
}
