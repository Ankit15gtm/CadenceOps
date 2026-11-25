export interface OutcomeRule {
  outcome: string;
  label: string;
  resultingStatus: string;
  recommendedChannels: string[];
}

export const DEFAULT_OUTCOME_RULES: OutcomeRule[] = [
  {
    outcome: 'RESEARCH_COMPLETED',
    label: 'Research Completed',
    resultingStatus: 'RESEARCHING',
    recommendedChannels: ['OTHER'],
  },
  {
    outcome: 'ATTEMPTED_NO_ANSWER',
    label: 'Attempted Call / No Answer',
    resultingStatus: 'NO_ANSWER',
    recommendedChannels: ['PHONE_CALL'],
  },
  {
    outcome: 'CONNECTED_CONVERSATION',
    label: 'Connected / Spoke with Prospect',
    resultingStatus: 'CONNECTED',
    recommendedChannels: ['PHONE_CALL'],
  },
  {
    outcome: 'LINKEDIN_REQUEST_SENT',
    label: 'LinkedIn Connection Request Sent',
    resultingStatus: 'LINKEDIN_REQUEST_SENT',
    recommendedChannels: ['LINKEDIN_CONNECTION'],
  },
  {
    outcome: 'LINKEDIN_REQUEST_ACCEPTED',
    label: 'LinkedIn Connection Accepted',
    resultingStatus: 'LINKEDIN_REQUEST_ACCEPTED',
    recommendedChannels: ['LINKEDIN_CONNECTION', 'LINKEDIN_MESSAGE'],
  },
  {
    outcome: 'LINKEDIN_MESSAGE_SENT',
    label: 'LinkedIn Message Sent',
    resultingStatus: 'LINKEDIN_MESSAGE_SENT',
    recommendedChannels: ['LINKEDIN_MESSAGE'],
  },
  {
    outcome: 'EMAIL_SENT',
    label: 'Outreach Email Sent',
    resultingStatus: 'EMAIL_SENT',
    recommendedChannels: ['EMAIL'],
  },
  {
    outcome: 'WHATSAPP_SENT',
    label: 'WhatsApp Message Sent',
    resultingStatus: 'WHATSAPP_SENT',
    recommendedChannels: ['WHATSAPP'],
  },
  {
    outcome: 'PROSPECT_INTERESTED',
    label: 'Prospect Interested',
    resultingStatus: 'INTERESTED',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'WHATSAPP'],
  },
  {
    outcome: 'FOLLOW_UP_REQUESTED',
    label: 'Follow-up Required / Call Back Later',
    resultingStatus: 'FOLLOW_UP_REQUIRED',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'WHATSAPP'],
  },
  {
    outcome: 'APPOINTMENT_BOOKED',
    label: 'Appointment Booked',
    resultingStatus: 'APPOINTMENT_BOOKED',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'WHATSAPP'],
  },
  {
    outcome: 'QUALIFIED_LEAD',
    label: 'Qualified Lead (Meets Criteria)',
    resultingStatus: 'QUALIFIED_LEAD',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE'],
  },
  {
    outcome: 'NOT_QUALIFIED',
    label: 'Not Qualified',
    resultingStatus: 'NOT_QUALIFIED',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'OTHER'],
  },
  {
    outcome: 'NOT_INTERESTED',
    label: 'Not Interested',
    resultingStatus: 'NOT_INTERESTED',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'WHATSAPP'],
  },
  {
    outcome: 'WRONG_CONTACT',
    label: 'Wrong Contact / Left Company',
    resultingStatus: 'WRONG_CONTACT',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE'],
  },
  {
    outcome: 'INVALID_CONTACT',
    label: 'Invalid Contact Info (Bounced / Disconnected)',
    resultingStatus: 'INVALID_CONTACT',
    recommendedChannels: ['PHONE_CALL', 'EMAIL'],
  },
  {
    outcome: 'INVALID_DATA',
    label: 'Invalid Company Data',
    resultingStatus: 'INVALID_DATA',
    recommendedChannels: ['OTHER'],
  },
  {
    outcome: 'DO_NOT_CONTACT',
    label: 'Do Not Contact (Opt-Out)',
    resultingStatus: 'DO_NOT_CONTACT',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'WHATSAPP'],
  },
  {
    outcome: 'COMPLETED',
    label: 'Outreach Sequence Completed',
    resultingStatus: 'COMPLETED',
    recommendedChannels: ['PHONE_CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'WHATSAPP', 'OTHER'],
  },
];

export function resolveStatusFromOutcome(outcome: string, customRules?: OutcomeRule[]): string {
  const rules = customRules && customRules.length > 0 ? customRules : DEFAULT_OUTCOME_RULES;
  const found = rules.find((r) => r.outcome === outcome);
  return found ? found.resultingStatus : 'ATTEMPTED_CONTACT';
}
