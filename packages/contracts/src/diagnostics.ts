import * as z from "zod";

export const DiagnosticSeveritySchema = z.enum(["info", "warn", "error", "critical"]);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

export const DiagnosticLayerSchema = z.enum([
  "api_rpc",
  "agent_executor",
  "inference_gateway",
  "mcp_connector",
  "skill_engine",
  "database_worker",
  "web_client",
]);
export type DiagnosticLayer = z.infer<typeof DiagnosticLayerSchema>;

export const DiagnosticIncidentContextSchema = z.object({
  route: z.string().max(240).optional(),
  botId: z.string().max(120).optional(),
  runId: z.string().max(120).optional(),
  toolName: z.string().max(120).optional(),
  connectorId: z.string().max(120).optional(),
  model: z.string().max(160).optional(),
  statusCode: z.number().int().optional(),
  durationMs: z.number().nonnegative().optional(),
  userAgent: z.string().max(240).optional(),
});
export type DiagnosticIncidentContext = z.infer<typeof DiagnosticIncidentContextSchema>;

export const DiagnosticIncidentSchema = z.object({
  id: z.string(),
  signature: z.string(),
  timestamp: z.string(),
  parisTime: z.string(),
  severity: DiagnosticSeveritySchema,
  layer: DiagnosticLayerSchema,
  code: z.string(),
  title: z.string(),
  message: z.string(),
  suspectedFile: z.string(),
  remediationHintFr: z.string(),
  stackPreview: z.array(z.string()),
  context: DiagnosticIncidentContextSchema,
  occurrences: z.number().int().positive(),
});
export type DiagnosticIncident = z.infer<typeof DiagnosticIncidentSchema>;

export const DiagnosticProbeStatusSchema = z.enum(["pass", "warn", "fail"]);
export type DiagnosticProbeStatus = z.infer<typeof DiagnosticProbeStatusSchema>;

export const DiagnosticProbeResultSchema = z.object({
  id: z.string(),
  nameFr: z.string(),
  status: DiagnosticProbeStatusSchema,
  latencyMs: z.number().nonnegative(),
  detailFr: z.string(),
  suspectedFile: z.string().optional(),
  remediationFr: z.string().optional(),
});
export type DiagnosticProbeResult = z.infer<typeof DiagnosticProbeResultSchema>;

export const RuntimeFootprintMetricsSchema = z.object({
  uptimeSec: z.number().nonnegative(),
  rssMb: z.number().nonnegative(),
  heapUsedMb: z.number().nonnegative(),
  heapTotalMb: z.number().nonnegative(),
  externalMb: z.number().nonnegative(),
  eventLoopLagMs: z.number().nonnegative(),
  nodeVersion: z.string(),
});
export type RuntimeFootprintMetrics = z.infer<typeof RuntimeFootprintMetricsSchema>;

export const DeepDiagnosticReportSchema = z.object({
  generatedAt: z.string(),
  parisTime: z.string(),
  gitSha: z.string(),
  overallStatus: z.enum(["healthy", "degraded", "critical"]),
  zeroLlmCost: z.literal(true),
  runtimeMetrics: RuntimeFootprintMetricsSchema,
  probes: z.array(DiagnosticProbeResultSchema),
  recentIncidents: z.array(DiagnosticIncidentSchema),
  aiForensicMarkdownFr: z.string(),
});
export type DeepDiagnosticReport = z.infer<typeof DeepDiagnosticReportSchema>;

export const ReportClientErrorInputSchema = z.object({
  code: z.string().max(80).default("CLIENT_UI_EXCEPTION").optional(),
  title: z.string().min(1).max(240),
  message: z.string().min(1).max(4000),
  stack: z.string().max(6000).optional(),
  route: z.string().max(240).optional(),
  componentHint: z.string().max(240).optional(),
  userAgent: z.string().max(240).optional(),
});
export type ReportClientErrorInput = z.infer<typeof ReportClientErrorInputSchema>;
