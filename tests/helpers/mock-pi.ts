/**
 * Mock ExtensionAPI factory for integration tests.
 *
 * Returns a pi mock that records all registration calls (on, registerCommand,
 * registerShortcut, registerFlag, etc.) so tests can assert what each
 * extension wires up — without needing the real pi-coding-agent runtime.
 */

export interface RegisteredEvent {
  event: string;
  handler: (...args: unknown[]) => unknown;
}

export interface RegisteredCommand {
  name: string;
  description: string;
  handler: (...args: unknown[]) => unknown;
}

export interface RegisteredShortcut {
  key: unknown;
  description: string;
  handler: (...args: unknown[]) => unknown;
}

export interface RegisteredFlag {
  name: string;
  description: string;
  type: string;
  default: unknown;
}

export interface MockRecords {
  events: RegisteredEvent[];
  commands: RegisteredCommand[];
  shortcuts: RegisteredShortcut[];
  flags: RegisteredFlag[];
  tools: unknown[];
  messages: unknown[];
  activeTools: string[][] ;
  entries: unknown[];
}

export interface MockPi {
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  registerCommand(name: string, opts: { description: string; handler: (...args: unknown[]) => unknown }): void;
  registerShortcut(key: unknown, opts: { description: string; handler: (...args: unknown[]) => unknown }): void;
  registerFlag(name: string, opts: { description: string; type: string; default: unknown }): void;
  registerTool(definition: unknown): void;
  exec(cmd: string, args: string[], opts?: unknown): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  sendMessage(msg: unknown, opts?: unknown): void;
  sendUserMessage(msg: string): void;
  setActiveTools(tools: string[]): void;
  appendEntry(type: string, data: unknown): void;
  getFlag(name: string): unknown;
}

export function createMockPi(): { pi: MockPi; records: MockRecords } {
  const records: MockRecords = {
    events: [],
    commands: [],
    shortcuts: [],
    flags: [],
    tools: [],
    messages: [],
    activeTools: [],
    entries: [],
  };

  const flagValues = new Map<string, unknown>();

  const pi: MockPi = {
    on(event, handler) {
      records.events.push({ event, handler });
    },
    registerCommand(name, opts) {
      records.commands.push({ name, description: opts.description, handler: opts.handler });
    },
    registerShortcut(key, opts) {
      records.shortcuts.push({ key, description: opts.description, handler: opts.handler });
    },
    registerFlag(name, opts) {
      records.flags.push({ name, description: opts.description, type: opts.type, default: opts.default });
      flagValues.set(name, opts.default);
    },
    registerTool(definition) {
      records.tools.push(definition);
    },
    async exec(_cmd, _args, _opts) {
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    sendMessage(msg, _opts) {
      records.messages.push(msg);
    },
    sendUserMessage(msg) {
      records.messages.push({ role: "user", content: msg });
    },
    setActiveTools(tools) {
      records.activeTools.push(tools);
    },
    appendEntry(type, data) {
      records.entries.push({ type, data });
    },
    getFlag(name) {
      return flagValues.get(name);
    },
  };

  return { pi, records };
}

/** Creates a minimal mock context for invoking command handlers in tests. */
export function createMockContext(overrides: Partial<MockContext> = {}): MockContext {
  const notifications: { message: string; type: string }[] = [];
  const statusUpdates: { key: string; text: string | undefined }[] = [];

  return {
    cwd: overrides.cwd ?? process.cwd(),
    hasUI: overrides.hasUI ?? true,
    notifications,
    statusUpdates,
    ui: {
      notify(message: string, type = "info") {
        notifications.push({ message, type });
      },
      setStatus(key: string, text: string | undefined) {
        statusUpdates.push({ key, text });
      },
      select: overrides.ui?.select ?? (async () => null),
      editor: overrides.ui?.editor ?? (async () => null),
      setHeader: overrides.ui?.setHeader ?? (() => {}),
      setWidget: overrides.ui?.setWidget ?? (() => {}),
      theme: {
        fg: (_style: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
      },
    },
    sessionManager: {
      getEntries: () => [],
    },
    reload: async () => {},
  };
}

export interface MockContext {
  cwd: string;
  hasUI: boolean;
  notifications: { message: string; type: string }[];
  statusUpdates: { key: string; text: string | undefined }[];
  ui: {
    notify(message: string, type?: string): void;
    setStatus(key: string, text: string | undefined): void;
    select: (...args: unknown[]) => Promise<string | null>;
    editor: (...args: unknown[]) => Promise<string | null>;
    setHeader: (...args: unknown[]) => void;
    setWidget: (...args: unknown[]) => void;
    theme: {
      fg: (style: string, text: string) => string;
      bold: (text: string) => string;
      strikethrough: (text: string) => string;
    };
  };
  sessionManager: {
    getEntries: () => unknown[];
  };
  reload: () => Promise<void>;
}
