import * as fs from "node:fs";
import * as path from "path";
import type * as http from "node:http";
import { HiBossDatabase } from "./db/database.js";
import { IpcServer } from "./ipc/server.js";
import { MessageRouter } from "./router/message-router.js";
import { ChannelBridge } from "./bridges/channel-bridge.js";
import { AgentExecutor, createAgentExecutor } from "../agent/executor.js";
import { type OneShotExecutor, createOneShotExecutor } from "../agent/oneshot-executor.js";
import type { Agent } from "../agent/types.js";
import { EnvelopeScheduler } from "./scheduler/envelope-scheduler.js";
import { CronScheduler } from "./scheduler/cron-scheduler.js";
import { ConversationHistory } from "./history/conversation-history.js";
import { bindHistoryHooks } from "./history/history-runtime-hooks.js";
import type { RpcMethodRegistry } from "./ipc/types.js";
import { RPC_ERRORS } from "./ipc/types.js";
import type { ChatAdapter } from "../adapters/types.js";
import { DEFAULT_AGENT_PERMISSION_LEVEL } from "../shared/defaults.js";
import { getHiBossPaths } from "../shared/hiboss-paths.js";
import {
  DEFAULT_PERMISSION_POLICY,
  type PermissionLevel,
  type PermissionPolicy,
  getRequiredPermissionLevel,
  isAtLeastPermissionLevel,
  parsePermissionPolicyOrDefault,
} from "../shared/permissions.js";
import { errorMessage, logEvent, setDaemonLogTimeZone } from "../shared/daemon-log.js";
import { getEnvelopeSourceFromEnvelope } from "../envelope/source.js";
import { PidLock, isDaemonRunning, isSocketAcceptingConnections } from "./pid-lock.js";
import type { DaemonContext, Principal } from "./rpc/context.js";
import { rpcError } from "./rpc/context.js";
import {
  createDaemonHandlers,
  createReactionHandlers,
  createCronHandlers,
  createEnvelopeHandlers,
  createTeamHandlers,
  createSetupHandlers,
  createAgentHandlers,
  createAgentSetHandler,
  createAgentDeleteHandler,
  createSessionChatHandlers,
} from "./rpc/index.js";
import { createChannelCommandHandler } from "./channel-commands.js";
import { TelegramTypingManager } from "./telegram-typing.js";
import { getSettingsPath } from "../shared/settings-io.js";
import { loadSettingsOrThrow, syncSettingsToDb } from "./settings-sync.js";
import { DaemonEventBus } from "./events/event-bus.js";
import { createRouterEventHooks, createExecutorEventHooks } from "./events/daemon-event-hooks.js";
import { createHttpServer, startHttpServer, stopHttpServer } from "./http/server.js";
import { createRoutes } from "./http/routes.js";
import { createWsServer } from "./ws/server.js";
import { BrokerManager } from "./relay/broker-manager.js";
import { RelayExecutor } from "../agent/executor-relay.js";
import {
  loadBindings as loadAdapterBindings,
  createAdapterForBinding as createAdapterForBindingHelper,
  removeAdapter as removeAdapterHelper,
} from "./adapter-management.js";
import { ConsoleAdapter } from "../adapters/console.adapter.js";

export { isDaemonRunning, isSocketAcceptingConnections };
/**
 * Hi-Boss daemon configuration.
 */
export interface DaemonConfig {
  /**
   * Hi-Boss root directory (user-facing).
   *
   * Default: `~/hiboss` (override via `HIBOSS_DIR`).
   */
  dataDir: string;
  /**
   * Internal daemon directory (hidden).
   *
   * Default: `{{dataDir}}/.daemon`.
   */
  daemonDir: string;
  boss?: {
    telegram?: string;
  };
}

/**
 * Default configuration paths.
 */
export function getDefaultConfig(): DaemonConfig {
  const paths = getHiBossPaths();
  return {
    dataDir: paths.rootDir,
    daemonDir: paths.daemonDir,
  };
}

/**
 * Get socket path for IPC client.
 */
export function getSocketPath(config: DaemonConfig = getDefaultConfig()): string {
  return path.join(config.daemonDir, "daemon.sock");
}

/**
 * Hi-Boss daemon - manages agents, messages, and platform integrations.
 */
export class Daemon {
  private db: HiBossDatabase;
  private ipc: IpcServer;
  private router: MessageRouter;
  private bridge: ChannelBridge;
  private executor: AgentExecutor;
  private oneshotExecutor: OneShotExecutor;
  private scheduler: EnvelopeScheduler;
  private cronScheduler: CronScheduler | null = null;
  private conversationHistory: ConversationHistory;
  private adapters: Map<string, ChatAdapter> = new Map(); // token -> adapter
  private telegramTypingManager: TelegramTypingManager;
  private running = false;
  private startTimeMs: number | null = null;
  private pidLock: PidLock;
  private defaultPermissionPolicy: PermissionPolicy = DEFAULT_PERMISSION_POLICY;
  private eventBus: DaemonEventBus;
  private httpServer: http.Server | null = null;
  private wsCleanup: (() => void) | null = null;
  private rpcMethods: RpcMethodRegistry = {};
  private brokerManager: BrokerManager;
  private relayExecutor: RelayExecutor | null = null;

  constructor(private config: DaemonConfig = getDefaultConfig()) {
    const dbPath = path.join(config.daemonDir, "hiboss.db");
    const socketPath = path.join(config.daemonDir, "daemon.sock");

    this.pidLock = new PidLock({ daemonDir: config.daemonDir });

    this.db = new HiBossDatabase(dbPath);
    this.ipc = new IpcServer(socketPath);
    this.eventBus = new DaemonEventBus();
    this.brokerManager = new BrokerManager({
      cwd: config.dataDir,
      eventBus: this.eventBus,
    });
    this.conversationHistory = new ConversationHistory({
      agentsDir: path.join(config.dataDir, "agents"),
      timezone: this.db.getBossTimezone() ?? undefined,
    });
    bindHistoryHooks(this.db, this.conversationHistory);
    const routerHooks = createRouterEventHooks(this.eventBus, () => this.cronScheduler);
    this.router = new MessageRouter(this.db, routerHooks);
    this.telegramTypingManager = new TelegramTypingManager(this.db, this.adapters);
    const executorEventHooks = createExecutorEventHooks(this.eventBus);
    this.executor = createAgentExecutor({
      db: this.db,
      hibossDir: config.dataDir,
      conversationHistory: this.conversationHistory,
      onEnvelopesDone: (envelopeIds) => {
        this.cronScheduler?.onEnvelopesDone(envelopeIds);
      },
      onRunStarted: executorEventHooks.onRunStarted,
      onRunFinished: executorEventHooks.onRunFinished,
      onExecutionQueued: ({ executionId, agentName, envelopes }) => {
        return this.telegramTypingManager.onExecutionQueued({
          executionId,
          agentName,
          envelopes,
        });
      },
      onExecutionFinished: ({ executionId }) => {
        return this.telegramTypingManager.onExecutionFinished({ executionId });
      },
    });
    this.bridge = new ChannelBridge(this.router, this.db, config, { executor: this.executor });
    this.oneshotExecutor = createOneShotExecutor({
      db: this.db,
      router: this.router,
      hibossDir: config.dataDir,
      onEnvelopeDone: (envelope) => this.cronScheduler?.onEnvelopeDone(envelope),
    });
    this.scheduler = new EnvelopeScheduler(this.db, this.router, this.executor);
    this.cronScheduler = new CronScheduler(this.db, this.scheduler);

    this.registerRpcMethods();
  }

  private getPermissionPolicy(): PermissionPolicy {
    const raw = this.db.getConfig("permission_policy");
    return parsePermissionPolicyOrDefault(raw, this.defaultPermissionPolicy);
  }

  private getAgentPermissionLevel(agent: Agent): PermissionLevel {
    return agent.permissionLevel ?? DEFAULT_AGENT_PERMISSION_LEVEL;
  }

  private resolvePrincipal(token: string): Principal {
    if (this.db.verifyAdminToken(token)) {
      return { kind: "admin", level: "admin" };
    }

    const agent = this.db.findAgentByToken(token);
    if (!agent) {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Invalid token");
    }

    return { kind: "agent", level: this.getAgentPermissionLevel(agent), agent };
  }

  private assertOperationAllowed(operation: string, principal: { level: PermissionLevel }): void {
    const policy = this.getPermissionPolicy();
    const required = getRequiredPermissionLevel(policy, operation);
    if (!isAtLeastPermissionLevel(principal.level, required)) {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
    }
  }

  private createContext(): DaemonContext {
    // Important: `running`/`startTimeMs` must reflect live daemon state (daemon.status depends on it).
    const daemon = this;
    return {
      db: this.db,
      router: this.router,
      executor: this.executor,
      scheduler: this.scheduler,
      cronScheduler: this.cronScheduler,
      adapters: this.adapters,
      config: this.config,
      get running() {
        return daemon.running;
      },
      get startTimeMs() {
        return daemon.startTimeMs;
      },
      resolvePrincipal: (token) => this.resolvePrincipal(token),
      assertOperationAllowed: (op, principal) => this.assertOperationAllowed(op, principal),
      getPermissionPolicy: () => this.getPermissionPolicy(),
      createAdapterForBinding: (type, token) => this.createAdapterForBinding(type, token),
      removeAdapter: (token) => this.removeAdapter(token),
      registerAgentHandler: (name) => this.registerSingleAgentHandler(name),
      eventBus: this.eventBus,
      get relayAvailable() {
        return daemon.brokerManager.isAvailable();
      },
      get relayExecutor() {
        return daemon.relayExecutor;
      },
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Daemon is already running");
    }

    // Acquire flock-based PID lock (single-instance enforcement).
    await this.pidLock.acquire();

    try {
      // Start IPC server
      await this.ipc.start();

      // Mark as running early so stop() can clean up partial startups.
      this.running = true;
      this.startTimeMs = Date.now();

      const daemonMode = (process.env.HIBOSS_DAEMON_MODE ?? "").trim().toLowerCase();
      const examplesMode = daemonMode === "examples";
      if (examplesMode) {
        // IPC-only daemon for generating deterministic docs (no schedulers/adapters/auto-execution).
        logEvent("info", "daemon-started", { "data-dir": this.config.dataDir, "adapters-count": 0, mode: "examples" });
        return;
      }

      // Canonical startup path: load settings.json and mirror into DB runtime cache.
      const settingsPath = getSettingsPath(this.config.dataDir);
      if (fs.existsSync(settingsPath)) {
        const settings = loadSettingsOrThrow(this.config.dataDir);
        syncSettingsToDb(this.db, settings);
      } else {
        throw new Error(
          [
            `Failed to load settings.json: Settings file not found: ${settingsPath}`,
            "Run `hiboss setup` to generate settings, then restart the daemon.",
          ].join("\n")
        );
      }

      this.conversationHistory.setTimezone(this.db.getBossTimezone());
      this.executor.setConcurrencyLimits(this.db.getRuntimeSessionConcurrency());

      // All displayed timestamps (including daemon logs) use the boss timezone.
      setDaemonLogTimeZone(this.db.getBossTimezone());

      // Set up command handler for /new etc.
      this.setupCommandHandler();

      // Register the console adapter (web management console).
      // Registered by type so any agent can deliver to channel:console:<chatId> without a per-agent binding.
      const consoleAdapter = new ConsoleAdapter({ eventBus: this.eventBus });
      this.router.registerAdapterByType("console", consoleAdapter);

      // Load bindings and create adapters
      await this.loadBindings();

      // Register agent handlers for auto-execution
      await this.registerAgentExecutionHandlers();

      // Start all loaded adapters
      for (const adapter of this.adapters.values()) {
        await adapter.start();
      }

      // Cron: skip missed runs before any startup delivery/turn triggers.
      this.cronScheduler?.reconcileAllSchedules({ skipMisfires: true });

      // Start scheduler after adapters/handlers are ready
      this.scheduler.start();

      // Start relay broker (graceful — skips if binary not found)
      await this.brokerManager.start();
      this.relayExecutor = new RelayExecutor({
        broker: this.brokerManager,
        db: this.db,
        hibossDir: this.config.dataDir,
      });

      // Start HTTP + WebSocket server
      await this.startHttpWsServer();

      // Process any pending envelopes from before restart
      await this.processPendingEnvelopes();
    } catch (err) {
      // Best-effort cleanup to avoid leaving stale pid/socket files.
      await this.stop().catch(() => {});
      await this.pidLock.release();
      this.running = false;
      throw err;
    }

    logEvent("info", "daemon-started", {
      "data-dir": this.config.dataDir,
      "adapters-count": this.adapters.size,
    });
  }

  private setupCommandHandler(): void {
    this.bridge.setCommandHandler(createChannelCommandHandler({
      db: this.db,
      executor: this.executor,
      router: this.router,
      hibossDir: this.config.dataDir,
    }));
  }

  private async registerAgentExecutionHandlers(): Promise<void> {
    const agents = this.db.listAgents();

    for (const agent of agents) {
      this.registerSingleAgentHandler(agent.name);
    }
  }

  private registerSingleAgentHandler(agentName: string): void {
    this.router.registerAgentHandler(agentName, async (envelope) => {
      const currentAgent = this.db.getAgentByName(agentName);
      if (!currentAgent) {
        logEvent("error", "agent-not-found", { "agent-name": agentName });
        return;
      }

      // One-shot routing: envelopes with oneshotType bypass the main queue.
      const md = envelope.metadata;
      if (md && typeof md === "object") {
        const oneshotType = (md as Record<string, unknown>).oneshotType;
        if (oneshotType === "clone" || oneshotType === "isolated") {
          this.oneshotExecutor.enqueue(envelope, currentAgent, oneshotType);
          return;
        }
      }

      // Non-blocking: trigger agent run
      this.executor.checkAndRun(currentAgent, this.db, {
        kind: "envelope",
        source: getEnvelopeSourceFromEnvelope(envelope),
        envelopeId: envelope.id,
      }).catch((err) => {
        logEvent("error", "agent-check-and-run-failed", {
          "agent-name": agentName,
          error: errorMessage(err),
        });
      });
    });
  }

  private async processPendingEnvelopes(): Promise<void> {
    const agents = this.db.listAgents();

    for (const agent of agents) {
      const pending = this.db.getPendingEnvelopesForAgent(agent.name, 1);
      if (pending.length > 0) {
        this.executor.checkAndRun(agent, this.db, { kind: "daemon-startup" }).catch((err) => {
          logEvent("error", "agent-check-and-run-failed", {
            "agent-name": agent.name,
            error: errorMessage(err),
          });
        });
      }
    }
  }

  private async loadBindings(): Promise<void> {
    await loadAdapterBindings({
      db: this.db, adapters: this.adapters, bridge: this.bridge, running: this.running,
    });
  }

  private async createAdapterForBinding(
    adapterType: string, adapterToken: string,
  ): Promise<ChatAdapter | null> {
    return createAdapterForBindingHelper(
      { db: this.db, adapters: this.adapters, bridge: this.bridge, running: this.running },
      adapterType, adapterToken,
    );
  }

  private async removeAdapter(adapterToken: string): Promise<void> {
    await removeAdapterHelper(this.adapters, adapterToken);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    // Stop scheduler first (prevents new work while shutting down)
    this.scheduler.stop();

    // Stop all adapters
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }

    // Close agent executor
    await this.executor.closeAll();

    // Release all relay sessions and stop broker
    if (this.relayExecutor) {
      await this.relayExecutor.releaseAll();
    }
    await this.brokerManager.stop();

    // Stop HTTP + WebSocket server
    if (this.wsCleanup) {
      this.wsCleanup();
      this.wsCleanup = null;
    }
    if (this.httpServer) {
      await stopHttpServer(this.httpServer);
      this.httpServer = null;
    }
    this.eventBus.removeAllListeners();

    // Stop IPC server
    await this.ipc.stop();

    // Close database
    this.db.close();

    // Release flock-based PID lock
    await this.pidLock.release();

    this.running = false;
    logEvent("info", "daemon-stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  private registerRpcMethods(): void {
    const ctx = this.createContext();

    this.rpcMethods = {
      ...createEnvelopeHandlers(ctx),
      ...createTeamHandlers(ctx),
      ...createReactionHandlers(ctx),
      ...createCronHandlers(ctx),
      ...createAgentHandlers(ctx),
      ...createAgentSetHandler(ctx),
      ...createAgentDeleteHandler(ctx),
      ...createDaemonHandlers(ctx),
      ...createSetupHandlers(ctx),
      ...createSessionChatHandlers(ctx),
    };

    this.ipc.registerMethods(this.rpcMethods);
  }

  private async startHttpWsServer(): Promise<void> {
    const ctx = this.createContext();
    const router = createRoutes(this.rpcMethods, ctx);

    this.httpServer = createHttpServer({ router });

    const { cleanup } = createWsServer(this.httpServer, ctx, this.eventBus);
    this.wsCleanup = cleanup;

    await startHttpServer(this.httpServer);
  }

  getEventBus(): DaemonEventBus {
    return this.eventBus;
  }
}
