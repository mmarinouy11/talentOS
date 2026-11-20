// Default for the editable SystemEmailTemplate REDEPLOYMENT_PROPOSAL (client-safe, plain text body).
// Never add the fit score or the person's personal email / phone / other roster fields.
export const REDEPLOYMENT_PROPOSAL_KEY = 'REDEPLOYMENT_PROPOSAL'

// {{peopleSummary}} renders one block per proposed person, so one template works for 1 or many people.
// The per-person placeholders (personName, lastRole, …) only make sense when a single person is proposed.
export const REDEPLOYMENT_PROPOSAL_PLACEHOLDERS = [
  'peopleSummary', 'peopleCount', 'peopleNames',
  'designation', 'account', 'opportunityLocation', 'workMode', 'requisitionIds', 'senderName',
  'personName', 'lastRole', 'lastClient', 'grade', 'yearsExperience', 'skills', 'availability', 'personLocation', 'strengths',
] as const

export const PEOPLE_SUMMARY_PLACEHOLDER = '{{peopleSummary}}'

export const REDEPLOYMENT_PROPOSAL_DEFAULT_SUBJECT = 'Candidate proposal for {{designation}} ({{account}}): {{peopleNames}}'

export const REDEPLOYMENT_PROPOSAL_DEFAULT_BODY = `Hi,

I'd like to propose {{peopleCount}} for the {{designation}} opening at {{account}} ({{opportunityLocation}}, {{workMode}}; requisition {{requisitionIds}}).

{{peopleSummary}}

The CVs are attached. Happy to set up a conversation.

Best regards,
{{senderName}}`

// A stored custom template without {{peopleSummary}} can't describe several people
export function templateSupportsSeveralPeople(subject: string | null | undefined, body: string | null | undefined): boolean {
  return `${subject ?? ''}\n${body ?? ''}`.includes(PEOPLE_SUMMARY_PLACEHOLDER)
}
