import { auth } from '@/lib/auth'
import Link from 'next/link'
import {
  Briefcase, Users, Calendar, Building2, FileText,
  BarChart2, Mail, Sparkles,
} from 'lucide-react'

const features = [
  {
    icon: Briefcase,
    title: 'Position Management',
    description:
      'Manage open positions with JD intelligence, skill extraction, core skill prioritization, and AI-generated screening questions.',
  },
  {
    icon: Users,
    title: 'Candidate Pipeline',
    description:
      'Full candidate lifecycle tracking with stage management, fit scoring, aging alerts, and grouped active/on-hold views.',
  },
  {
    icon: Calendar,
    title: 'Interview Coordination',
    description:
      'Schedule interviews with magic link feedback for technical panels, skill-based evaluation forms, and automated notifications.',
  },
  {
    icon: Building2,
    title: 'Partner Portal',
    description:
      'Dedicated portal for recruiting partners to submit candidates, view pipeline status, and track their submissions with real-time validation.',
  },
  {
    icon: FileText,
    title: 'Direct Applications',
    description:
      'Public application portal with AI-generated screening questions, fit scoring, budget validation, and privacy consent.',
  },
  {
    icon: BarChart2,
    title: 'Reporting & Analytics',
    description:
      'Daily pipeline reports, account status views, activity feeds, and performance tracking.',
  },
  {
    icon: Mail,
    title: 'Email Automation',
    description:
      'Gmail-based email sending with customizable system templates for scheduling, feedback requests, partner notifications, and invitations.',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered',
    description:
      'Claude AI for CV parsing, fit scoring with core skill weighting, JD analysis, Tenarai-branded CV generation, and feedback summarization.',
  },
]

const steps = [
  {
    number: '1',
    title: 'Create a Position',
    description: 'Add job details, parse the JD, set screening criteria and scoring thresholds.',
  },
  {
    number: '2',
    title: 'Source & Evaluate',
    description:
      'Candidates flow in via internal sourcing, partners, or direct applications — automatically scored and validated.',
  },
  {
    number: '3',
    title: 'Move to Hire',
    description: 'Track interviews, collect feedback, advance through stages to offer and onboarding.',
  },
]

export default async function RootPage() {
  const session = await auth()
  const isAuthenticated = !!session?.user

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'system-ui, Arial, sans-serif', color: '#2F2C29' }}>

      {/* Nav */}
      <nav style={{ background: '#000', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
          Tenarai <span style={{ color: '#8CF000' }}>LATAM</span>
        </span>
        <Link
          href={isAuthenticated ? '/positions' : '/login'}
          style={{
            background: '#8CF000', color: '#000', fontWeight: 700, fontSize: 13,
            padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
          }}
        >
          {isAuthenticated ? 'Go to Dashboard' : 'Sign In'}
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 780, margin: '0 auto', padding: '80px 24px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: '#000', color: '#8CF000', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 999, marginBottom: 24 }}>
          Internal Tool
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 20, color: '#000' }}>
          TalentOS —<br />Recruiting Intelligence Platform
        </h1>
        <p style={{ fontSize: 18, color: '#5a5550', lineHeight: 1.65, maxWidth: 560, margin: '0 auto 36px' }}>
          End-to-end recruiting operations for Tenarai LATAM. From sourcing to hire, all in one place.
        </p>
        <Link
          href={isAuthenticated ? '/positions' : '/login'}
          style={{
            display: 'inline-block', background: '#8CF000', color: '#000',
            fontWeight: 800, fontSize: 15, padding: '14px 36px',
            borderRadius: 12, textDecoration: 'none', letterSpacing: '-0.01em',
          }}
        >
          {isAuthenticated ? 'Go to Dashboard →' : 'Sign In →'}
        </Link>
      </section>

      {/* Divider */}
      <div style={{ maxWidth: 900, margin: '0 auto 64px', height: 1, background: '#e5e0da', marginLeft: 24, marginRight: 24 }} />

      {/* Features grid */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 32, textAlign: 'center' }}>
          Platform Features
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              style={{
                background: '#fff', borderRadius: 16, padding: '24px 22px',
                border: '1px solid #e8e3dd',
              }}
            >
              <div style={{ width: 36, height: 36, background: '#000', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Icon size={18} color="#8CF000" strokeWidth={2} />
              </div>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#2F2C29' }}>{title}</p>
              <p style={{ fontSize: 13, color: '#6b6560', lineHeight: 1.6 }}>{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: '#000', padding: '64px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8CF000', marginBottom: 32, textAlign: 'center' }}>
            How It Works
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
            {steps.map(({ number, title, description }) => (
              <div key={number} style={{ textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#8CF000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontWeight: 900, fontSize: 18, color: '#000' }}>
                  {number}
                </div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 8 }}>{title}</p>
                <p style={{ fontSize: 13, color: '#9a9490', lineHeight: 1.6 }}>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#000', borderTop: '1px solid #1a1a1a', padding: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#6b6560', marginBottom: 4 }}>
          © 2026 Tenarai LATAM · Built with TalentOS
        </p>
        <p style={{ fontSize: 11, color: '#4a4540' }}>Powered by Anthropic Claude</p>
      </footer>
    </div>
  )
}
