/**
 * dataService — backward-compatible barrel re-exporting all service modules.
 *
 * New code should import directly from the specific service:
 *   import { getCases } from "@/services/caseService"
 *   import { getJudges } from "@/services/judgeService"
 *   import { queryRag } from "@/services/ragService"
 *   ...etc.
 *
 * Existing code that imports { dataService } from "@/services/dataService"
 * continues to work unchanged through the object below.
 */

export * from "./api";
export * from "./caseService";
export * from "./historyService";
export * from "./judgeService";
export * from "./pdfService";
export * from "./ragService";

// ── Legacy object facade ────────────────────────────────────────────────────
// Keeps all pages that destructure `dataService.someMethod(...)` working
// without modification.

import * as caseService from "./caseService";
import * as historyService from "./historyService";
import * as judgeService from "./judgeService";
import * as pdfService from "./pdfService";
import * as ragService from "./ragService";

export const dataService = {
  // Case methods
  getCases: caseService.getCases,
  searchCases: caseService.searchCases,
  getFilteredCases: caseService.getFilteredCases,
  getCaseById: caseService.getCaseById,
  explainCaseMatch: caseService.explainCaseMatch,
  explainMatches: caseService.explainMatches,
  generateHumanizedCaseNarrative: caseService.generateHumanizedCaseNarrative,
  getInsights: caseService.getInsights,

  // History methods
  getActivityHistory: historyService.getActivityHistory,
  saveSearch: historyService.saveSearch,
  savePDFUpload: historyService.savePDFUpload,
  saveViewedCase: historyService.saveViewedCase,

  // Judge methods
  getJudges: judgeService.getJudges,
  getJudgeById: judgeService.getJudgeById,
  addJudge: judgeService.addJudge,
  editJudge: judgeService.editJudge,
  removeJudge: judgeService.removeJudge,
  getAvailableJudgesByArea: judgeService.getAvailableJudgesByArea,
  getJudgeAvailabilityStatus: judgeService.getJudgeAvailabilityStatus,
  getJudgesCountByArea: judgeService.getJudgesCountByArea,
  assignJudgeForFIR: judgeService.assignJudgeForFIR,
  recommendJudgeForCase: judgeService.recommendJudgeForCase,

  // Hearing methods
  getHearings: judgeService.getHearings,
  getAllHearings: judgeService.getAllHearings,
  getHearingsByJudgeId: judgeService.getHearingsByJudgeId,
  scheduleHearing: judgeService.scheduleHearing,
  addHearing: judgeService.addHearing,
  createHearing: judgeService.createHearing,
  updateHearing: judgeService.updateHearing,
  editHearing: judgeService.editHearing,
  cancelHearing: judgeService.cancelHearing,
  removeHearing: judgeService.removeHearing,
  deleteHearing: judgeService.deleteHearing,
  scheduleHearingForAssignment: judgeService.scheduleHearingForAssignment,

  // PDF methods
  analyzePDF: pdfService.analyzePDF,
  assessFIRPriority: pdfService.assessFIRPriority,
  assessCaseRouting: pdfService.assessCaseRouting,

  // RAG / analysis methods
  queryRag: ragService.queryRag,
  analyzeCaseContext: ragService.analyzeCaseContext,
};
