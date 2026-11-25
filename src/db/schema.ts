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
