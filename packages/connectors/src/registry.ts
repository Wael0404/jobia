import type { JobSourceId } from "@jobia/shared";
import { BoardConnector } from "./sites/board";
import { LinkedInConnector } from "./sites/linkedin";
import { EMPLOI_TUNISIE, KEEJOB, TANITJOBS } from "./sites/tunisia";
import type { JobSourceConnector } from "./types";

export type BrowserSourceId = Exclude<JobSourceId, "email">;

export interface RegistryOptions {
  /** LinkedIn automation is opt-in at the platform level (see docs/COMPLIANCE.md). */
  linkedinEnabled: boolean;
}

export class ConnectorRegistry {
  private readonly connectors = new Map<BrowserSourceId, JobSourceConnector>();

  constructor(options: RegistryOptions) {
    if (options.linkedinEnabled) this.register(new LinkedInConnector());
    for (const profile of [TANITJOBS, KEEJOB, EMPLOI_TUNISIE]) this.register(new BoardConnector(profile));
  }

  private register(connector: JobSourceConnector): void {
    this.connectors.set(connector.id as BrowserSourceId, connector);
  }

  get(id: JobSourceId): JobSourceConnector | undefined {
    return id === "email" ? undefined : this.connectors.get(id);
  }

  list(): JobSourceConnector[] {
    return [...this.connectors.values()];
  }
}
