import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { callClaude } from '@/lib/anthropic'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({
    where: { id },
    include: {
      candidate: {
        select: {
          firstName: true, lastName: true, summary: true,
          skills: true, languages: true, seniority: true, yearsOfExperience: true,
        },
      },
      position: {
        select: { title: true, client: true, jdSkills: true, coreSkills: true },
      },
    },
  })
  if (!cp) return new NextResponse('Not found', { status: 404 })

  const { candidate, position } = cp

  const bannerUrl = await db.systemSettings.findUnique({ where: { key: 'EMAIL_HEADER_IMAGE_URL' } })
    .then((s) => s?.value ?? null).catch(() => null)

  const anonymizedName = `${candidate.firstName} ${candidate.lastName.charAt(0).toUpperCase()}.`

  const positionSkills = [
    ...(position.coreSkills ?? []),
    ...(position.jdSkills ?? []),
  ].map((s) => s.toLowerCase())

  const matchingSkills = candidate.skills.filter((skill) =>
    positionSkills.some((ps) => ps.includes(skill.toLowerCase()) || skill.toLowerCase().includes(ps))
  )
  const additionalSkills = candidate.skills.filter((s) => !matchingSkills.includes(s))

  const seniorityLabel = candidate.seniority
    ? candidate.seniority.charAt(0) + candidate.seniority.slice(1).toLowerCase()
    : null

  const prompt = `Generate the inner body content for a professional CV being presented by Tenarai LATAM.

CANDIDATE DATA:
- Name: ${anonymizedName}
- Seniority: ${seniorityLabel ?? 'Not specified'}
- Years of Experience: ${candidate.yearsOfExperience != null ? `${candidate.yearsOfExperience} years` : 'Not specified'}
- Summary: ${candidate.summary ?? 'Not provided'}
- Matching Skills (highlight these — they match the position): ${matchingSkills.length > 0 ? matchingSkills.join(', ') : 'None identified'}
- Additional Skills: ${additionalSkills.length > 0 ? additionalSkills.join(', ') : 'None'}
- Languages: ${candidate.languages.length > 0 ? candidate.languages.join(', ') : 'Not specified'}

POSITION: ${position.title} at ${position.client}

OUTPUT RULES:
- Return ONLY inner HTML (no <!DOCTYPE>, <html>, <head>, <body> tags).
- Use ONLY inline CSS — no <style> tags.
- Brand: lime #8CF000, dark #1a1a1a, gray #666, light-gray #f0f0f0.

STRUCTURE (follow exactly):
1. <div style="background:#1a1a1a;padding:28px 40px;"> containing <span style="color:#8CF000;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">PRESENTED BY TENARAI LATAM</span>
2. <div style="max-width:760px;margin:0 auto;padding:40px 48px;font-family:Arial,Helvetica,sans-serif;">
3. Inside that div:
   - <h1 style="font-size:30px;font-weight:800;color:#1a1a1a;margin:0 0 6px 0;">${anonymizedName}</h1>
   - <p style="font-size:14px;color:#666;margin:0 0 20px 0;">${seniorityLabel ? seniorityLabel + (candidate.yearsOfExperience != null ? ` · ${candidate.yearsOfExperience} years experience` : '') : (candidate.yearsOfExperience != null ? `${candidate.yearsOfExperience} years experience` : '')}</p>
   - <div style="border-top:3px solid #8CF000;margin-bottom:28px;"></div>
   - PROFESSIONAL SUMMARY section heading: <span style="display:block;font-size:10px;font-weight:800;color:#8CF000;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px 0;">Professional Summary</span> then a <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 24px 0;">paragraph</p>. OMIT this section if summary is "Not provided".
   - MATCHING SKILLS: heading same style. <p style="font-size:11px;color:#999;margin:0 0 8px 0;">Matches position requirements</p> then chip spans: <span style="display:inline-block;background:#8CF000;color:#1a1a1a;font-weight:700;font-size:12px;padding:5px 12px;border-radius:4px;margin:0 4px 4px 0;">SkillName</span>. OMIT if matchingSkills is empty.
   - ADDITIONAL SKILLS: heading same style. Chip spans: <span style="display:inline-block;background:#f0f0f0;color:#555;font-size:12px;padding:5px 12px;border-radius:4px;margin:0 4px 4px 0;">SkillName</span>. OMIT if none.
   - LANGUAGES: heading same style. Same chip style as additional skills. OMIT if "Not specified".
   - EXPERIENCE: heading same style. <p style="font-size:14px;color:#999;font-style:italic;margin:0;">Detailed experience available upon request.</p>
   - Footer: <div style="border-top:1px solid #e5e5e5;margin-top:40px;padding-top:16px;text-align:center;font-size:11px;color:#aaa;font-family:Arial,sans-serif;">Confidential — Presented by Tenarai LATAM · hr.latam@tenarai.com</div>
4. Close all divs properly.

No contact info. No markdown. No explanation. HTML only.`

  let bodyContent: string
  try {
    bodyContent = await callClaude(prompt, 'FAST')
    bodyContent = bodyContent.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim()
  } catch (err) {
    console.error('[tenarai-cv] Claude error:', err)
    bodyContent = `<div style="padding:40px;font-family:Arial,sans-serif;color:#c00;">Failed to generate CV content. Please try again.</div>`
  }

  const bannerHtml = bannerUrl
    ? `<img src="${bannerUrl}" alt="" style="width:100%;max-height:80px;object-fit:cover;display:block;" />`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CV — ${anonymizedName} | Tenarai LATAM</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  .toolbar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: #1a1a1a; display: flex; align-items: center; justify-content: space-between; padding: 10px 24px; font-family: Arial, sans-serif; }
  .toolbar-label { color: #8CF000; font-size: 13px; font-weight: 600; letter-spacing: 1px; }
  .toolbar-btn { background: #8CF000; color: #1a1a1a; border: none; padding: 7px 18px; border-radius: 4px; font-weight: 700; font-size: 13px; cursor: pointer; }
  .toolbar-btn:hover { background: #a0ff10; }
  .toolbar-spacer { height: 44px; }
  @media print {
    .toolbar, .toolbar-spacer { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-label">Tenarai LATAM · CV Preview</span>
  <button class="toolbar-btn" onclick="window.print()">Download / Print PDF</button>
</div>
<div class="toolbar-spacer"></div>
${bannerHtml}
${bodyContent}
<script>setTimeout(function(){ window.print(); }, 900);<\/script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
