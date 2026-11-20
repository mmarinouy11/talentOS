// Default for the editable SystemEmailTemplate REDEPLOYMENT_PROPOSAL (client-safe, plain text body).
// Never add the fit score or the person's personal email / phone / other roster fields.
export const REDEPLOYMENT_PROPOSAL_KEY = 'REDEPLOYMENT_PROPOSAL'

export const REDEPLOYMENT_PROPOSAL_PLACEHOLDERS = [
  'personName', 'lastRole', 'lastClient', 'grade', 'yearsExperience', 'skills', 'availability', 'personLocation',
  'strengths', 'designation', 'account', 'opportunityLocation', 'workMode', 'requisitionIds', 'senderName',
] as const

export const REDEPLOYMENT_PROPOSAL_DEFAULT_SUBJECT = 'Candidate proposal for {{designation}} ({{account}}): {{personName}}'

export const REDEPLOYMENT_PROPOSAL_DEFAULT_BODY = `Hi,

I'd like to propose {{personName}} for the {{designation}} opening at {{account}} ({{opportunityLocation}}, {{workMode}}; requisition {{requisitionIds}}).

About {{personName}}:
- Last role: {{lastRole}} at {{lastClient}}
- Grade: {{grade}}
- Experience: {{yearsExperience}}
- Key skills: {{skills}}
- Location: {{personLocation}}
- {{availability}}

Why they are a good fit:
{{strengths}}

The CV is attached. Happy to set up a conversation.

Best regards,
{{senderName}}`
