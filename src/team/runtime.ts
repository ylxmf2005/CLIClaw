import type { Agent } from "../agent/types.js";
import type { CliClawDatabase } from "../daemon/db/database.js";
import { getDefaultRuntimeWorkspace } from "../shared/defaults.js";
import { ensureTeamspaceDir, getTeamspaceDir } from "./teamspace.js";

export interface TeamPromptContext {
  name: string;
  members: string[];
  teamspaceDir: string;
}

function resolveTeamspaceDir(params: {
  cliclawDir: string;
  teamName: string;
}): string {
  const ensured = ensureTeamspaceDir({
    cliclawDir: params.cliclawDir,
    teamName: params.teamName,
  });
  return ensured.ok ? ensured.dir : getTeamspaceDir(params.teamName, params.cliclawDir);
}

export function resolveAgentWorkspace(params: {
  db: CliClawDatabase;
  cliclawDir: string;
  agent: Agent;
}): string {
  const teams = params.db.listTeamsByAgentName(params.agent.name, { activeOnly: true });
  const primary = teams[0];
  if (!primary) {
    return params.agent.workspace ?? getDefaultRuntimeWorkspace();
  }
  return resolveTeamspaceDir({
    cliclawDir: params.cliclawDir,
    teamName: primary.name,
  });
}

export function buildAgentTeamPromptContext(params: {
  db: CliClawDatabase;
  cliclawDir: string;
  agent: Agent;
}): TeamPromptContext[] {
  const teams = params.db.listTeamsByAgentName(params.agent.name, { activeOnly: true });
  return teams.map((team) => ({
    name: team.name,
    members: params.db.listTeamMemberAgentNames(team.name),
    teamspaceDir: resolveTeamspaceDir({
      cliclawDir: params.cliclawDir,
      teamName: team.name,
    }),
  }));
}
