import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

const APP_FIELDS = [
  { key: 'companyName', label: 'Company Name *' },
  { key: 'website', label: 'Website' },
  { key: 'domain', label: 'Company Domain' },
  { key: 'companyLinkedinUrl', label: 'Company LinkedIn URL' },
  { key: 'industry', label: 'Industry' },
  { key: 'employeeSize', label: 'Employee Size' },
  { key: 'country', label: 'Country' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'description', label: 'Company Description' },
  { key: 'firstName', label: 'Contact First Name' },
  { key: 'lastName', label: 'Contact Last Name' },
  { key: 'fullName', label: 'Contact Full Name' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'department', label: 'Department' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'workEmail', label: 'Work Email' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'contactLinkedinUrl', label: 'Contact LinkedIn URL' },
  { key: 'aiScore', label: 'AI Score' },
  { key: 'fitScore', label: 'Fit Score' },
];

const SAMPLE_CSV = `Company,Website,Industry,Employees,Country,First Name,Last Name,Title,Email,Phone,Person Linkedin Url,AI Score
Vanguard Cloud Systems,https://vanguardcloud.io,Cloud Software,420,United States,Claire,Donovan,CTO,claire.donovan@vanguardcloud.io,+1-415-555-0141,https://linkedin.com/in/claire-donovan-cto,92
AetherOps Telemetry,https://aetherops.io,DevOps SaaS,185,United States,Marcus,Lin,VP Engineering,marcus.lin@aetherops.io,+1-415-555-0299,https://linkedin.com/in/marcus-lin-devops,88
Silverline BioSystems,https://silverlinebio.com,Healthcare IT,340,Canada,Elena,Rostova,CISO,elena@silverlinebio.com,+1-416-555-0831,https://linkedin.com/in/elena-rostova-ciso,91
Broken Row Co,,SaaS,50,United States,Sam,Lee,Director,not-an-email,,https://linkedin.com/in/sam-lee,60`;

function autoGuessMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const lowerHeaders = headers.map((h) => ({ raw: h, norm: h.toLowerCase().replace(/[^a-z0-9]/g, '') }));

  const patterns: Record<string, string[]> = {
    companyName: ['companyname', 'company', 'organization', 'accountname'],
    website: ['website', 'companywebsite', 'url'],
    domain: ['domain', 'companydomain'],
    companyLinkedinUrl: ['companylinkedin', 'companylinkedinurl', 'organizationlinkedin'],
    industry: ['industry'],
    employeeSize: ['employees', 'employeesize', 'headcount', 'companysize'],
    country: ['country', 'companycountry'],
    revenue: ['revenue', 'annualrevenue'],
    description: ['description', 'companydescription'],
    firstName: ['firstname'],
    lastName: ['lastname'],
    fullName: ['fullname', 'contactname', 'name'],
    jobTitle: ['title', 'jobtitle', 'role'],
    department: ['department'],
    seniority: ['seniority'],
    workEmail: ['email', 'workemail', 'emailaddress'],
    phone: ['phone', 'phonenumber', 'directphone', 'mobile'],
    contactLinkedinUrl: ['personlinkedinurl', 'linkedinurl', 'linkedin', 'contactlinkedin'],
    aiScore: ['aiscore'],
    fitScore: ['fitscore'],
  };

  for (const [field, candidates] of Object.entries(patterns)) {
    const match = lowerHeaders.find((h) => candidates.includes(h.norm));
    if (match) map[field] = match.raw;
  }
  return map;
}

export function DataImportsPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');

  const [fileName, setFileName] = useState('');
  const [dataSource, setDataSource] = useState('Apollo');
  const [campaignId, setCampaignId] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, any>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<'REUSE_IN_CAMPAIGN' | 'SKIP_DUPLICATE'>('REUSE_IN_CAMPAIGN');
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const [impRes, cmpRes] = await Promise.all([apiFetch('/api/imports'), apiFetch('/api/campaigns')]);
      setBatches(impRes.batches);
      setCampaigns(cmpRes.campaigns);
      if (cmpRes.campaigns.length > 0 && !campaignId) {
        setCampaignId(String(cmpRes.campaigns[0].id));
      }
    } catch {
      // handled
    }
  }, [campaignId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const parseWorkbook = (buf: ArrayBuffer, name: string) => {
    const wb = XLSX.read(buf, { type: 'array' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) {
      toast.error('Uploaded file contains no worksheets.');
      return;
    }
    const ws = wb.Sheets[firstSheet]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    if (rows.length === 0) {
      toast.error('Uploaded file has no data rows.');
      return;
    }
    const headers = Object.keys(rows[0]!);
    setFileName(name);
    setRawHeaders(headers);
    setRawRows(rows);
    setMapping(autoGuessMapping(headers));
    setStep('map');
    toast.success(`Parsed ${rows.length} rows from ${name}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    parseWorkbook(buf, file.name);
  };

  const loadSampleDataset = () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode(SAMPLE_CSV).buffer;
    parseWorkbook(buf, 'apollo_sample_export.csv');
  };

  const buildMappedRows = () => {
    return rawRows.map((raw, idx) => {
      const out: Record<string, any> = { rowNumber: idx + 1 };
      for (const field of APP_FIELDS) {
        const colName = mapping[field.key];
        if (colName && raw[colName] !== undefined) {
          out[field.key] = String(raw[colName]).trim();
        }
      }
      return out;
    });
  };

  const runPreview = async () => {
    if (!mapping.companyName) {
      toast.error('Please map the Company Name column before previewing.');
      return;
    }
    setBusy(true);
    try {
      const mapped = buildMappedRows();
      const res = await apiFetch('/api/imports/preview', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: campaignId ? Number(campaignId) : null,
          rows: mapped,
        }),
      });
      setPreviewResult(res);
      setStep('preview');
    } catch (err: any) {
      toast.error(err?.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    setBusy(true);
    try {
      const mapped = buildMappedRows();
      const res = await apiFetch('/api/imports/commit', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          dataSource,
          campaignId: campaignId ? Number(campaignId) : null,
          columnMapping: mapping,
          rows: mapped,
          duplicatePolicy,
        }),
      });
      toast.success(
        `Batch ${res.batch.batchCode} imported: ${res.batch.importedCompanies} new companies, ${res.batch.importedContacts} contacts, ${res.batch.duplicatesDetected} duplicates checked.`
      );
      setStep('upload');
      setPreviewResult(null);
      setRawRows([]);
      await loadHistory();
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Data Import &amp; Duplicate Prevention
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Import Apollo, Excel (.xlsx/.xls), or CSV datasets with column mapping, data validation, and automatic duplicate detection.
        </p>
      </div>

      {/* Wizard Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {step === 'upload' && 'Step 1: Upload Dataset & Select Campaign'}
            {step === 'map' && `Step 2: Map Columns (${fileName} · ${rawRows.length} rows)`}
            {step === 'preview' && 'Step 3: Validation & Duplicate Detection Report'}
          </CardTitle>
          {step !== 'upload' && (
            <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
              Start Over
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Target Campaign</Label>
                  <SelectField value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                    <option value="">Central Pool Only (No Campaign)</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.campaignCode})</option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <Label>Data Source</Label>
                  <SelectField value={dataSource} onChange={(e) => setDataSource(e.target.value)}>
                    <option value="Apollo">Apollo.io</option>
                    <option value="Excel">Excel Sheet</option>
                    <option value="CSV">CSV Export</option>
                    <option value="Other">Other Lead Provider</option>
                  </SelectField>
                </div>
              </div>

              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center space-y-3">
                <FileSpreadsheet className="h-8 w-8 text-blue-700 dark:text-blue-400 mx-auto" />
                <div className="text-sm font-medium">Upload Excel (.xlsx, .xls) or CSV file</div>
                <p className="text-xs text-slate-500">
                  Columns are mapped interactively and checked against centralized company &amp; contact records.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <span>Choose Spreadsheet File</span>
                    <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                  </label>
                  <Button type="button" variant="outline" onClick={loadSampleDataset}>
                    Load Sample Apollo CSV
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {APP_FIELDS.map((field) => (
                  <div key={field.key}>
                    <Label>{field.label}</Label>
                    <SelectField
                      value={mapping[field.key] || ''}
                      onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                    >
                      <option value="">— Skip Field —</option>
                      {rawHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </SelectField>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={runPreview} disabled={busy}>
                  {busy ? 'Analyzing Duplicates...' : 'Run Validation & Duplicate Check'}
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && previewResult && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                {[
                  { label: 'Total Rows', value: previewResult.summary.totalRows },
                  { label: 'New Valid Rows', value: previewResult.summary.validNewRows, tone: 'text-emerald-700' },
                  { label: 'Duplicates Detected', value: previewResult.summary.duplicatesDetected, tone: 'text-amber-700' },
                  { label: 'DNC Blocked', value: previewResult.summary.dncSuppressedRows || 0, tone: 'text-red-700' },
                  { label: 'Missing Info', value: previewResult.summary.missingInfoRows },
                  { label: 'Invalid Rows (Skipped)', value: previewResult.summary.invalidRows, tone: 'text-red-700' },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">{s.label}</div>
                    <div className={`font-mono text-xl font-semibold tabular-nums mt-0.5 ${s.tone || ''}`}>{s.value}</div>
                  </div>
                ))}
              </div>

              {previewResult.summary.duplicatesDetected > 0 && (
                <div className="p-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Duplicate Warning: {previewResult.summary.duplicatesDetected} matching record(s) already exist in the centralized database</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                    <Label className="mb-0">Duplicate Handling Policy:</Label>
                    <SelectField
                      className="sm:w-80"
                      value={duplicatePolicy}
                      onChange={(e) => setDuplicatePolicy(e.target.value as any)}
                    >
                      <option value="REUSE_IN_CAMPAIGN">Reuse centralized records &amp; enroll in campaign (if not already enrolled)</option>
                      <option value="SKIP_DUPLICATE">Skip all duplicate records completely</option>
                    </SelectField>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Row</th>
                      <th className="py-2.5 px-3 font-medium">Company &amp; Contact</th>
                      <th className="py-2.5 px-3 font-medium">Validation</th>
                      <th className="py-2.5 px-3 font-medium">Duplicate Check &amp; Prior History</th>
                      <th className="py-2.5 px-3 font-medium text-right">AI / Fit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewResult.rows.slice(0, 50).map((r: any) => (
                      <tr key={r.rowNumber}>
                        <td className="py-2.5 px-3 font-mono">{r.rowNumber}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 dark:text-white">{r.raw.companyName || '(Missing)'}</div>
                          <div className="text-slate-500">{r.raw.workEmail || r.raw.domain || r.raw.website || '—'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusLabel status={r.validationStatus} />
                            {r.isDncSuppressed && (
                              <span className="px-1.5 py-0.5 rounded border border-red-300 bg-red-50 text-red-700 text-[10px] font-semibold">
                                DNC BLOCKED
                              </span>
                            )}
                          </div>
                          {r.issues?.length > 0 && (
                            <div className="text-slate-500 mt-1">{r.issues.join(', ')}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.isDuplicate && r.duplicateInfo ? (
                            <div className="space-y-1">
                              <div className="font-medium text-amber-800 dark:text-amber-300">
                                Match ({r.duplicateInfo.matchType}): {r.duplicateInfo.existingCompanyName || r.duplicateInfo.existingContactName}
                              </div>
                              {r.duplicateInfo.previousCampaigns?.length > 0 && (
                                <div className="text-slate-500">
                                  Prior Campaigns:{' '}
                                  {r.duplicateInfo.previousCampaigns
                                    .map((pc: any) => `${pc.campaignName} (${pc.assignedTo}, ${pc.status})`)
                                    .join(' · ')}
                                </div>
                              )}
                              <div className="text-slate-500 font-mono">
                                Prior outreach touches: {r.duplicateInfo.previousOutreachCount}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Unique record
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {r.aiScore} / {r.fitScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep('map')}>Back to Mapping</Button>
                <Button onClick={commitImport} disabled={busy}>
                  {busy ? 'Importing Batch...' : 'Confirm & Commit Import'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader><CardTitle>Import Batch History</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Batch ID</th>
                <th className="py-3 px-4 font-medium">File &amp; Source</th>
                <th className="py-3 px-4 font-medium">Campaign</th>
                <th className="py-3 px-4 font-medium">Imported By</th>
                <th className="py-3 px-4 font-medium text-right">Total Rows</th>
                <th className="py-3 px-4 font-medium text-right">New Co.</th>
                <th className="py-3 px-4 font-medium text-right">Duplicates</th>
                <th className="py-3 px-4 font-medium text-right">Invalid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 px-4 font-mono text-xs font-medium">{b.batchCode}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-xs">{b.fileName}</div>
                    <div className="text-xs text-slate-500">{b.dataSource} · {b.createdAt.slice(0, 10)}</div>
                  </td>
                  <td className="py-3 px-4 text-xs">{b.campaignName}</td>
                  <td className="py-3 px-4 text-xs">{b.importedByName}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{b.totalRows}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">{b.importedCompanies}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700">{b.duplicatesDetected}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">{b.invalidRows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
