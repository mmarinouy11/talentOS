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

export type SkillCategory = 'Languages' | 'Frameworks' | 'Cloud & DevOps' | 'AI & Data' | 'Soft Skills' | 'Other'

const SKILL_CATEGORY_MAP: Record<string, SkillCategory> = {
  // Languages
  python: 'Languages', go: 'Languages', java: 'Languages', javascript: 'Languages',
  typescript: 'Languages', sql: 'Languages', 'c#': 'Languages', ruby: 'Languages',
  php: 'Languages', rust: 'Languages', swift: 'Languages', kotlin: 'Languages',
  scala: 'Languages', 'c++': 'Languages', bash: 'Languages', shell: 'Languages',
  // Frameworks & Libraries
  kubernetes: 'Frameworks', docker: 'Frameworks', 'node.js': 'Frameworks',
  django: 'Frameworks', flask: 'Frameworks', spring: 'Frameworks', 'express.js': 'Frameworks',
  react: 'Frameworks', 'next.js': 'Frameworks', fastapi: 'Frameworks', rails: 'Frameworks',
  laravel: 'Frameworks', angular: 'Frameworks', vue: 'Frameworks', graphql: 'Frameworks',
  // Cloud & DevOps
  aws: 'Cloud & DevOps', azure: 'Cloud & DevOps', gcp: 'Cloud & DevOps',
  'ci/cd': 'Cloud & DevOps', git: 'Cloud & DevOps', terraform: 'Cloud & DevOps',
  ansible: 'Cloud & DevOps', jenkins: 'Cloud & DevOps', 'github actions': 'Cloud & DevOps',
  'docker compose': 'Cloud & DevOps', helm: 'Cloud & DevOps', linux: 'Cloud & DevOps',
  'kubernetes operators': 'Cloud & DevOps', prometheus: 'Cloud & DevOps', grafana: 'Cloud & DevOps',
  datadog: 'Cloud & DevOps', nginx: 'Cloud & DevOps', 'observability tools': 'Cloud & DevOps',
  // AI & Data
  'llm automation': 'AI & Data', 'ai-assisted scripting': 'AI & Data',
  postgresql: 'AI & Data', mongodb: 'AI & Data', mysql: 'AI & Data',
  redis: 'AI & Data', elasticsearch: 'AI & Data', kafka: 'AI & Data',
  spark: 'AI & Data', 'machine learning': 'AI & Data', tensorflow: 'AI & Data',
  pytorch: 'AI & Data', pandas: 'AI & Data', 'data engineering': 'AI & Data',
  // Soft Skills
  'incident response': 'Soft Skills', 'team collaboration': 'Soft Skills',
  ownership: 'Soft Skills', 'on-call operations': 'Soft Skills', 'problem solving': 'Soft Skills',
  leadership: 'Soft Skills', communication: 'Soft Skills', agile: 'Soft Skills', scrum: 'Soft Skills',
}

const CATEGORY_ORDER: SkillCategory[] = ['Languages', 'Frameworks', 'Cloud & DevOps', 'AI & Data', 'Soft Skills', 'Other']

export function categorizeSkill(skill: string): SkillCategory {
  return SKILL_CATEGORY_MAP[skill.toLowerCase()] ?? 'Other'
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
  seniority: string | null
  yearsOfExperience: number | null
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderSkillsSection(skills: string[], matchingSkillSet: Set<string>): string {
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
  if (experience.length === 0) {
    return sectionHeader('Professional Experience') +
      `<p style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};font-style:italic;margin:0;">Detailed experience available upon request.</p>`
  }

  const blocks = experience.map((e) => {
    const bullets = e.bullets.length > 0
      ? `<ul style="margin:6px 0 0 0;padding-left:18px;color:${CHARCOAL};font-size:13px;line-height:1.65;font-family:${FONT};">${e.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
      : ''
    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;">
          <span style="font-family:${FONT};font-size:14px;font-weight:700;color:${CARBON};">${esc(e.title)}</span>
          <span style="font-family:${FONT};font-size:12px;color:${WARM_GRAY};white-space:nowrap;">${esc(e.startDate)} – ${esc(e.endDate)}</span>
        </div>
        <span style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};font-style:italic;display:block;margin-top:1px;">${esc(e.company)}</span>
        ${bullets}
      </div>`
  }).join('')

  return sectionHeader('Professional Experience') + blocks
}

function renderEducationSection(education: CvEducationEntry[]): string {
  if (education.length === 0) return ''
  const rows = education.map((e) => `
    <div style="margin-bottom:10px;">
      <span style="font-family:${FONT};font-size:14px;font-weight:700;color:${CARBON};">${esc(e.degree)}</span>
      <span style="font-family:${FONT};font-size:13px;color:${WARM_GRAY};display:block;margin-top:1px;">${esc(e.institution)}${e.year ? ` · ${esc(e.year)}` : ''}</span>
    </div>`).join('')
  return sectionHeader('Education') + rows
}

export function renderTenoraiCv(data: TenoraiCvData): string {
  const { anonymizedName, positionTitle, seniority, yearsOfExperience, summary, skills, matchingSkillSet, languages, experience, education } = data

  const subtitle = [
    `Postulación para: ${positionTitle}`,
    seniority,
    yearsOfExperience != null ? `${yearsOfExperience}+ años de experiencia` : null,
  ].filter(Boolean).join(' | ')

  const summaryHtml = summary
    ? sectionHeader('Professional Summary') +
      `<p style="font-family:${FONT};font-size:14px;line-height:1.7;color:${CHARCOAL};margin:0 0 4px 0;">${esc(summary)}</p>`
    : ''

  const languagesHtml = languages.length > 0
    ? sectionHeader('Languages') +
      `<p style="font-family:${FONT};font-size:13px;color:${CHARCOAL};margin:0;">${languages.map(esc).join(' · ')}</p>`
    : ''

  const skillsHtml = renderSkillsSection(skills, matchingSkillSet)
  const experienceHtml = renderExperienceSection(experience)
  const educationHtml = renderEducationSection(education)

  const toolbar = `
    <div class="toolbar" style="position:fixed;top:0;left:0;right:0;z-index:999;background:${CARBON};display:flex;align-items:center;justify-content:space-between;padding:10px 24px;font-family:${FONT};">
      <span style="color:${VOLT};font-size:13px;font-weight:600;letter-spacing:1px;">Tenarai LATAM · CV Preview</span>
      <button onclick="window.print()" style="background:${VOLT};color:${CARBON};border:none;padding:7px 18px;border-radius:4px;font-weight:700;font-size:13px;cursor:pointer;font-family:${FONT};">Download / Print PDF</button>
    </div>
    <div class="toolbar-spacer" style="height:44px;"></div>`

  const footer = `
    <div style="margin-top:48px;padding-top:16px;border-top:1px solid ${LIGHT_BORDER};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      ${LOGO_SVG}
      <span style="font-family:${FONT};font-size:11px;color:${WARM_GRAY};">Confidential — Presented by Tenarai LATAM | hr.latam@tenarai.com</span>
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
<script>setTimeout(function(){ window.print(); }, 900);<\/script>
</body>
</html>`
}
