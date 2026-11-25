import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// 1. Users & Employees
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  employeeCode: text('employee_code').unique().notNull(),
  username: text('username').unique().notNull(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  resetTokenHash: text('reset_token_hash'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  department: text('department').notNull().default('Sales'),
  jobRole: text('job_role').notNull().default('Sales Representative'),
  role: text('role').notNull().default('SALES_REP'), // SUPER_ADMIN | DATA_MANAGER | HR_MANAGER | SALES_REP
  joiningDate: text('joining_date').notNull(),
  reportingManagerId: integer('reporting_manager_id'),
  isActive: boolean('is_active').default(true).notNull(),
  avatarUrl: text('avatar_url'),
  dailyCallTarget: integer('daily_call_target').default(35).notNull(),
  dailyOutreachTarget: integer('daily_outreach_target').default(60).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. Configurable Prospecting Statuses
export const prospectStatuses = pgTable('prospect_statuses', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  label: text('label').notNull(),
  category: text('category').notNull().default('IN_PROGRESS'), // PENDING | IN_PROGRESS | POSITIVE | CLOSED
  sortOrder: integer('sort_order').notNull().default(0),
  isTerminal: boolean('is_terminal').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

// 3. Application Settings
export const appSettings = pgTable('app_settings', {
  id: serial('id').primaryKey(),
  key: text('key').unique().notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Campaigns
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  campaignCode: text('campaign_code').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  clientName: text('client_name'),
  objective: text('objective'),
  targetIndustry: text('target_industry'),
  targetCountries: text('target_countries'),
  targetJobTitles: text('target_job_titles'),
  targetCompanySize: text('target_company_size'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  campaignManagerId: integer('campaign_manager_id').references(() => users.id),
  dataManagerId: integer('data_manager_id').references(() => users.id),
  status: text('status').notNull().default('DRAFT'), // DRAFT | READY | ACTIVE | PAUSED | COMPLETED | ARCHIVED
  targetCompaniesCount: integer('target_companies_count').default(0).notNull(),
  notes: text('notes'),
  instructions: text('instructions'),
  qualificationCriteria: text('qualification_criteria'),
  qualificationQuestions: jsonb('qualification_questions').$type<string[]>().default([]),
  allowDuplicateAssignments: boolean('allow_duplicate_assignments').default(false).notNull(),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5. Campaign Members
export const campaignMembers = pgTable(
  'campaign_members',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .references(() => campaigns.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    memberRole: text('member_role').notNull().default('SALES_REP'),
    allocatedQuota: integer('allocated_quota').default(0).notNull(),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('campaign_members_unique_idx').on(table.campaignId, table.userId)]
);

// 6. Centralized Companies
export const companies = pgTable(
  'companies',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    website: text('website'),
    domain: text('domain'),
    normalizedDomain: text('normalized_domain').unique(),
    linkedinUrl: text('linkedin_url'),
    normalizedLinkedin: text('normalized_linkedin'),
    industry: text('industry'),
    employeeSize: text('employee_size'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    revenue: text('revenue'),
    description: text('description'),
    aiScore: integer('ai_score').default(0).notNull(),
    fitScore: integer('fit_score').default(0).notNull(),
    dataSource: text('data_source').default('Manual').notNull(),
    validationStatus: text('validation_status').default('VALID').notNull(), // VALID | MISSING_INFO | INVALID
    timezone: text('timezone'),
    isArchived: boolean('is_archived').default(false).notNull(),
    customFields: jsonb('custom_fields').$type<Record<string, string>>().default({}),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('companies_norm_name_idx').on(table.normalizedName)]
);

// 7. Centralized Contacts
export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    fullName: text('full_name').notNull(),
    jobTitle: text('job_title'),
    department: text('department'),
    seniority: text('seniority'),
    workEmail: text('work_email'),
    normalizedEmail: text('normalized_email').unique(),
    phone: text('phone'),
    normalizedPhone: text('normalized_phone'),
    linkedinUrl: text('linkedin_url'),
    normalizedLinkedin: text('normalized_linkedin').unique(),
    country: text('country'),
    dataSource: text('data_source').default('Manual').notNull(),
    aiScore: integer('ai_score').default(0).notNull(),
    fitScore: integer('fit_score').default(0).notNull(),
    validationStatus: text('validation_status').default('VALID').notNull(),
    doNotContact: boolean('do_not_contact').default(false).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('contacts_company_idx').on(table.companyId)]
);

// 8. Import Batches
export const importBatches = pgTable('import_batches', {
  id: serial('id').primaryKey(),
  batchCode: text('batch_code').unique().notNull(),
  fileName: text('file_name').notNull(),
  dataSource: text('data_source').notNull().default('CSV'),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  importedById: integer('imported_by_id')
    .references(() => users.id)
    .notNull(),
  totalRows: integer('total_rows').default(0).notNull(),
  importedCompanies: integer('imported_companies').default(0).notNull(),
  importedContacts: integer('imported_contacts').default(0).notNull(),
  duplicatesDetected: integer('duplicates_detected').default(0).notNull(),
  invalidRows: integer('invalid_rows').default(0).notNull(),
  missingInfoRows: integer('missing_info_rows').default(0).notNull(),
  columnMapping: jsonb('column_mapping').$type<Record<string, string>>(),
  invalidReport: jsonb('invalid_report').$type<Array<Record<string, unknown>>>().default([]),
  duplicateReport: jsonb('duplicate_report').$type<Array<Record<string, unknown>>>().default([]),
  status: text('status').default('COMPLETED').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Import Records
export const importRecords = pgTable('import_records', {
  id: serial('id').primaryKey(),
  batchId: integer('batch_id')
    .references(() => importBatches.id, { onDelete: 'cascade' })
    .notNull(),
  rowNumber: integer('row_number').notNull(),
  companyId: integer('company_id').references(() => companies.id),
  contactId: integer('contact_id').references(() => contacts.id),
  outcome: text('outcome').notNull(), // CREATED | REUSED_DUPLICATE | SKIPPED_DUPLICATE | INVALID | MISSING_INFO
  details: text('details'),
  rawPayload: jsonb('raw_payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. Campaign Company Records (Independent campaign-level status & assignment)
export const campaignCompanyRecords = pgTable(
  'campaign_company_records',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .references(() => campaigns.id, { onDelete: 'cascade' })
      .notNull(),
    companyId: integer('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    importBatchId: integer('import_batch_id').references(() => importBatches.id),
    isApproved: boolean('is_approved').default(true).notNull(),
    status: text('status').notNull().default('NOT_YET_WORKED'),
    assignedToId: integer('assigned_to_id').references(() => users.id),
    assignedById: integer('assigned_by_id').references(() => users.id),
    assignedAt: timestamp('assigned_at'),
    dueDate: text('due_date'),
    assignmentInstructions: text('assignment_instructions'),
    lastActivityAt: timestamp('last_activity_at'),
    lastOutcome: text('last_outcome'),
    nextFollowUpAt: timestamp('next_follow_up_at'),
    workedCount: integer('worked_count').default(0).notNull(),
    prospectSummary: text('prospect_summary'),
    prospectSentiment: text('prospect_sentiment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('campaign_company_unique_idx').on(table.campaignId, table.companyId),
    index('campaign_company_assignee_idx').on(table.assignedToId),
  ]
);

// 11. Campaign Contact Records
export const campaignContactRecords = pgTable(
  'campaign_contact_records',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .references(() => campaigns.id, { onDelete: 'cascade' })
      .notNull(),
    campaignCompanyRecordId: integer('campaign_company_record_id')
      .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
      .notNull(),
    companyId: integer('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    contactId: integer('contact_id')
      .references(() => contacts.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull().default('NOT_YET_WORKED'),
    assignedToId: integer('assigned_to_id').references(() => users.id),
    lastActivityAt: timestamp('last_activity_at'),
    lastOutcome: text('last_outcome'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('campaign_contact_unique_idx').on(table.campaignId, table.contactId)]
);

// 12. Assignments
export const assignments = pgTable('assignments', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  campaignCompanyRecordId: integer('campaign_company_record_id')
    .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
    .notNull(),
  assignedToId: integer('assigned_to_id')
    .references(() => users.id)
    .notNull(),
  assignedById: integer('assigned_by_id')
    .references(() => users.id)
    .notNull(),
  distributionDate: text('distribution_date').notNull(),
  deadline: text('deadline'),
  instructions: text('instructions'),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | REASSIGNED | COMPLETED
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 13. Assignment History
export const assignmentHistory = pgTable('assignment_history', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  campaignCompanyRecordId: integer('campaign_company_record_id')
    .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
    .notNull(),
  previousAssigneeId: integer('previous_assignee_id').references(() => users.id),
  newAssigneeId: integer('new_assignee_id')
    .references(() => users.id)
    .notNull(),
  changedById: integer('changed_by_id')
    .references(() => users.id)
    .notNull(),
  action: text('action').notNull(), // ASSIGNED | REASSIGNED
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 14. Outreach Activities
export const activities = pgTable('activities', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  campaignCompanyRecordId: integer('campaign_company_record_id')
    .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
    .notNull(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: integer('contact_id').references(() => contacts.id),
  createdById: integer('created_by_id')
    .references(() => users.id)
    .notNull(),
  activityDate: text('activity_date').notNull(),
  activityTime: text('activity_time').notNull(),
  channel: text('channel').notNull(), // PHONE_CALL | LINKEDIN_CONNECTION | LINKEDIN_MESSAGE | EMAIL | WHATSAPP | OTHER
  activityType: text('activity_type').notNull(),
  outcome: text('outcome').notNull(),
  responseCategory: text('response_category'),
  notes: text('notes'),
  followUpDate: text('follow_up_date'),
  resultingStatus: text('resulting_status').notNull(),
  durationSeconds: integer('duration_seconds'),
  emailSubject: text('email_subject'),
  externalMessageId: text('external_message_id'),
  recordingUrl: text('recording_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 15. Follow-Ups
export const followUps = pgTable('follow_ups', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  campaignCompanyRecordId: integer('campaign_company_record_id')
    .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
    .notNull(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: integer('contact_id').references(() => contacts.id),
  assignedToId: integer('assigned_to_id')
    .references(() => users.id)
    .notNull(),
  followUpType: text('follow_up_type').notNull(), // CALL | EMAIL | LINKEDIN_MESSAGE | WHATSAPP | OTHER
  followUpDate: text('follow_up_date').notNull(),
  followUpTime: text('follow_up_time').notNull(),
  reminderMinutes: integer('reminder_minutes').default(30).notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('PENDING'), // PENDING | COMPLETED | RESCHEDULED | CANCELLED | OVERDUE
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 16. Appointments
export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  campaignCompanyRecordId: integer('campaign_company_record_id')
    .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
    .notNull(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: integer('contact_id').references(() => contacts.id),
  prospectName: text('prospect_name').notNull(),
  prospectTitle: text('prospect_title'),
  prospectPhone: text('prospect_phone'),
  prospectEmail: text('prospect_email'),
  assignedToId: integer('assigned_to_id')
    .references(() => users.id)
    .notNull(),
  appointmentDate: text('appointment_date').notNull(),
  appointmentTime: text('appointment_time').notNull(),
  timezone: text('timezone').notNull().default('America/New_York'),
  meetingType: text('meeting_type').notNull().default('Video Call'),
  meetingLink: text('meeting_link'),
  meetingLocation: text('meeting_location'),
  notes: text('notes'),
  requirements: text('requirements'),
  status: text('status').notNull().default('SCHEDULED'), // SCHEDULED | CONFIRMED | PENDING_CONFIRMATION | RESCHEDULED | COMPLETED | NO_SHOW | CANCELLED
  confirmationStatus: text('confirmation_status').notNull().default('PENDING'),
  googleEventId: text('google_event_id'),
  calendarSynced: boolean('calendar_synced').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 17. Data Requests
export const dataRequests = pgTable('data_requests', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  industry: text('industry'),
  country: text('country'),
  targetJobTitles: text('target_job_titles'),
  companySize: text('company_size'),
  quantityRequired: integer('quantity_required').notNull(),
  reason: text('reason'),
  priority: text('priority').notNull().default('MEDIUM'), // LOW | MEDIUM | HIGH | URGENT
  requestedById: integer('requested_by_id')
    .references(() => users.id)
    .notNull(),
  reviewedById: integer('reviewed_by_id').references(() => users.id),
  status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED | IN_PROGRESS | FULFILLED | CANCELLED
  managerRemarks: text('manager_remarks'),
  fulfilledQuantity: integer('fulfilled_quantity').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 18. Notifications
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  linkPath: text('link_path'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 19. Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  userName: text('user_name'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  previousValue: jsonb('previous_value'),
  newValue: jsonb('new_value'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 20. Leave Requests (HR)
export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  leaveType: text('leave_type').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  reason: text('reason'),
  status: text('status').notNull().default('PENDING'),
  reviewedById: integer('reviewed_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 21. Global DNC Suppression List
export const dncSuppression = pgTable(
  'dnc_suppression',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull(), // DOMAIN | EMAIL | PHONE
    value: text('value').notNull(),
    rawValue: text('raw_value').notNull(),
    reason: text('reason'),
    addedById: integer('added_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('dnc_type_value_idx').on(table.type, table.value)]
);

// 22. Outreach Templates & Call Scripts
export const outreachTemplates = pgTable('outreach_templates', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  channel: text('channel').notNull(), // EMAIL | LINKEDIN_MESSAGE | WHATSAPP | CALL_SCRIPT
  subject: text('subject'),
  body: text('body').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 23. Automated Multi-Touch Sequences
export const sequences = pgTable('sequences', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  stopOnReply: boolean('stop_on_reply').default(true).notNull(),
  stopOnAppointment: boolean('stop_on_appointment').default(true).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 24. Sequence Steps
export const sequenceSteps = pgTable('sequence_steps', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id')
    .references(() => sequences.id, { onDelete: 'cascade' })
    .notNull(),
  stepOrder: integer('step_order').notNull(),
  delayDays: integer('delay_days').default(2).notNull(),
  channel: text('channel').notNull(), // PHONE_CALL | EMAIL | LINKEDIN_CONNECTION | LINKEDIN_MESSAGE | WHATSAPP
  templateId: integer('template_id').references(() => outreachTemplates.id, { onDelete: 'set null' }),
  instructions: text('instructions'),
});

// 25. Sequence Enrollments
export const sequenceEnrollments = pgTable(
  'sequence_enrollments',
  {
    id: serial('id').primaryKey(),
    sequenceId: integer('sequence_id')
      .references(() => sequences.id, { onDelete: 'cascade' })
      .notNull(),
    campaignCompanyRecordId: integer('campaign_company_record_id')
      .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
      .notNull(),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    enrolledById: integer('enrolled_by_id').references(() => users.id),
    currentStepOrder: integer('current_step_order').default(1).notNull(),
    nextDueDate: text('next_due_date').notNull(),
    status: text('status').default('ACTIVE').notNull(), // ACTIVE | PAUSED | COMPLETED | STOPPED_REPLY | STOPPED_APPOINTMENT
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('seq_enrollment_unique_idx').on(table.sequenceId, table.campaignCompanyRecordId)]
);

// 26. Rep Data Correction / Enrichment Flags
export const dataFlags = pgTable('data_flags', {
  id: serial('id').primaryKey(),
  campaignCompanyRecordId: integer('campaign_company_record_id').references(() => campaignCompanyRecords.id, {
    onDelete: 'cascade',
  }),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  reportedById: integer('reported_by_id')
    .references(() => users.id)
    .notNull(),
  issueType: text('issue_type').notNull(), // WRONG_NUMBER | BOUNCED_EMAIL | OUTDATED_TITLE | DUPLICATE | MISSING_DECISION_MAKER | OTHER
  proposedFix: text('proposed_fix'),
  notes: text('notes'),
  status: text('status').default('OPEN').notNull(), // OPEN | RESOLVED | DISMISSED
  resolvedById: integer('resolved_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 27. Saved Filter Views
export const savedViews = pgTable('saved_views', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  page: text('page').notNull(),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<Record<string, string>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 28. Prospect Remarks & Account Intelligence Notes
export const prospectRemarks = pgTable(
  'prospect_remarks',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .references(() => campaigns.id, { onDelete: 'cascade' })
      .notNull(),
    campaignCompanyRecordId: integer('campaign_company_record_id')
      .references(() => campaignCompanyRecords.id, { onDelete: 'cascade' })
      .notNull(),
    companyId: integer('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    authorId: integer('author_id')
      .references(() => users.id)
      .notNull(),
    category: text('category').default('GENERAL').notNull(), // GENERAL | PAIN_POINT | BUDGET_TIMELINE | DECISION_MAKER | COMPETITOR_STACK | OBJECTION | NEXT_STEP | HANDOVER
    content: text('content').notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('prospect_remarks_ccr_idx').on(table.campaignCompanyRecordId),
    index('prospect_remarks_company_idx').on(table.companyId),
  ]
);

// 29. Opportunity / Deal Pipeline
export const deals = pgTable(
  'deals',
  {
    id: serial('id').primaryKey(),
    dealCode: text('deal_code').notNull().unique(),
    title: text('title').notNull(),
    campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    campaignCompanyRecordId: integer('campaign_company_record_id').references(() => campaignCompanyRecords.id, {
      onDelete: 'set null',
    }),
    companyId: integer('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    ownerId: integer('owner_id')
      .references(() => users.id)
      .notNull(),
    stage: text('stage').default('DISCOVERY').notNull(), // DISCOVERY | PROPOSAL | NEGOTIATION | CLOSED_WON | CLOSED_LOST
    amount: integer('amount').default(0).notNull(), // USD annual contract value
    probability: integer('probability').default(20).notNull(), // 0 - 100
    expectedCloseDate: text('expected_close_date'),
    lossReason: text('loss_reason'),
    notes: text('notes'),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('deals_owner_idx').on(table.ownerId),
    index('deals_stage_idx').on(table.stage),
    index('deals_company_idx').on(table.companyId),
  ]
);

