/**
 * Built-in Resource Providers
 *
 * Provides default resource providers for common use cases:
 * - ColorProvider: Color names, hex codes, palettes
 * - TimeProvider: Current time, dates, timestamps
 * - ConfigProvider: Application configuration values
 * - EnvProvider: Environment variables
 */

import type {
  ResourceProvider,
  ResourceContext,
  ResolvedResource,
} from "./types.js";

// ============================================================================
// COLOR PROVIDER (Static)
// ============================================================================

/**
 * Named colors mapping
 */
const COLORS: Record<string, string> = {
  // Basic colors
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  white: "#ffffff",
  black: "#000000",

  // Extended colors
  orange: "#ff8000",
  purple: "#8000ff",
  pink: "#ff80c0",
  brown: "#804000",
  gray: "#808080",
  grey: "#808080",

  // Light variants
  lightred: "#ff8080",
  lightgreen: "#80ff80",
  lightblue: "#8080ff",
  lightyellow: "#ffff80",
  lightgray: "#c0c0c0",
  lightgrey: "#c0c0c0",

  // Dark variants
  darkred: "#800000",
  darkgreen: "#008000",
  darkblue: "#000080",
  darkyellow: "#808000",
  darkgray: "#404040",
  darkgrey: "#404040",

  // UI colors
  primary: "#3b82f6",
  secondary: "#64748b",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
};

/**
 * Color palettes
 */
const PALETTES: Record<string, string[]> = {
  ocean: ["#0077b6", "#00b4d8", "#90e0ef", "#caf0f8", "#03045e"],
  forest: ["#2d6a4f", "#40916c", "#52b788", "#74c69d", "#95d5b2"],
  sunset: ["#ff6b6b", "#ffa06b", "#ffd93d", "#ff8c00", "#ff5733"],
  pastel: ["#ffd1dc", "#ffb3ba", "#bae1ff", "#baffc9", "#ffffba"],
  monochrome: ["#000000", "#404040", "#808080", "#c0c0c0", "#ffffff"],
  warm: ["#ff5733", "#ff8d1a", "#ffc300", "#ffdd57", "#fff3cd"],
  cool: ["#0d47a1", "#1976d2", "#42a5f5", "#90caf9", "#e3f2fd"],
  earth: ["#8b4513", "#a0522d", "#cd853f", "#deb887", "#f5deb3"],
};

/**
 * Color resource provider
 */
export const colorProvider: ResourceProvider<string | string[]> = {
  name: "color",

  definitions: [
    {
      name: "color",
      description: "Get color by name or hex code",
      hasArgs: true,
      argPattern: /^[a-zA-Z]+$|^#[0-9a-fA-F]{3,6}$/,
      argDescription: "<color-name|#hex>",
      examples: ["@color(red)", "@color(#ff5733)", "@color(primary)"],
      isAsync: false,
      category: "styling",
    },
    {
      name: "palette",
      description: "Get a color palette",
      hasArgs: true,
      argPattern: /^[a-zA-Z]+$/,
      argDescription: "<palette-name>",
      examples: ["@palette(ocean)", "@palette(sunset)", "@palette(pastel)"],
      isAsync: false,
      category: "styling",
    },
  ],

  handles(resourceName: string): boolean {
    return resourceName === "color" || resourceName === "palette";
  },

  get(
    resourceName: string,
    args: string[],
    _context: ResourceContext
  ): ResolvedResource<string | string[]> {
    if (resourceName === "color") {
      const colorArg = args[0]?.toLowerCase();

      // Check if it's a hex code
      if (colorArg?.startsWith("#")) {
        return {
          value: colorArg,
          summary: colorArg,
          tokenEstimate: 2,
          success: true,
        };
      }

      // Look up named color
      const hex = COLORS[colorArg];
      if (hex) {
        return {
          value: hex,
          summary: `${colorArg} (${hex})`,
          tokenEstimate: 3,
          success: true,
        };
      }

      return {
        value: "",
        summary: `Unknown color: ${colorArg}`,
        tokenEstimate: 0,
        success: false,
        error: `Unknown color: ${colorArg}. Available: ${Object.keys(COLORS).slice(0, 10).join(", ")}...`,
      };
    }

    if (resourceName === "palette") {
      const paletteName = args[0]?.toLowerCase();
      const colors = PALETTES[paletteName];

      if (colors) {
        return {
          value: colors,
          summary: `${paletteName} palette (${colors.length} colors)`,
          tokenEstimate: colors.length * 2,
          success: true,
        };
      }

      return {
        value: [],
        summary: `Unknown palette: ${paletteName}`,
        tokenEstimate: 0,
        success: false,
        error: `Unknown palette: ${paletteName}. Available: ${Object.keys(PALETTES).join(", ")}`,
      };
    }

    return {
      value: "",
      summary: "Unknown resource",
      tokenEstimate: 0,
      success: false,
      error: `Unknown color resource: ${resourceName}`,
    };
  },

  validate(resourceName: string, args: string[]): { valid: boolean; error?: string } {
    if (args.length === 0) {
      return { valid: false, error: `@${resourceName} requires an argument` };
    }

    const arg = args[0].toLowerCase();

    if (resourceName === "color") {
      if (arg.startsWith("#") || COLORS[arg]) {
        return { valid: true };
      }
      return { valid: false, error: `Unknown color: ${arg}` };
    }

    if (resourceName === "palette") {
      if (PALETTES[arg]) {
        return { valid: true };
      }
      return { valid: false, error: `Unknown palette: ${arg}` };
    }

    return { valid: false, error: `Unknown resource: ${resourceName}` };
  },

  suggest(resourceName: string, partial: string): string[] {
    const search = partial.toLowerCase();

    if (resourceName === "color") {
      return Object.keys(COLORS)
        .filter((name) => name.startsWith(search))
        .slice(0, 10);
    }

    if (resourceName === "palette") {
      return Object.keys(PALETTES).filter((name) => name.startsWith(search));
    }

    return [];
  },
};

// ============================================================================
// TIME PROVIDER (Dynamic)
// ============================================================================

/**
 * Time resource provider
 */
export const timeProvider: ResourceProvider<string | number | Date> = {
  name: "time",

  definitions: [
    {
      name: "now",
      description: "Current timestamp in milliseconds",
      hasArgs: false,
      examples: ["@now"],
      isAsync: false,
      category: "time",
    },
    {
      name: "today",
      description: "Today's date in ISO format",
      hasArgs: false,
      examples: ["@today"],
      isAsync: false,
      category: "time",
    },
    {
      name: "time",
      description: "Current time in HH:MM:SS format",
      hasArgs: false,
      examples: ["@time"],
      isAsync: false,
      category: "time",
    },
    {
      name: "datetime",
      description: "Current date and time in ISO format",
      hasArgs: false,
      examples: ["@datetime"],
      isAsync: false,
      category: "time",
    },
    {
      name: "timestamp",
      description: "Unix timestamp in seconds",
      hasArgs: false,
      examples: ["@timestamp"],
      isAsync: false,
      category: "time",
    },
  ],

  handles(resourceName: string): boolean {
    return ["now", "today", "time", "datetime", "timestamp"].includes(resourceName);
  },

  get(
    resourceName: string,
    _args: string[],
    _context: ResourceContext
  ): ResolvedResource<string | number | Date> {
    const now = new Date();

    switch (resourceName) {
      case "now":
        return {
          value: now.getTime(),
          summary: String(now.getTime()),
          tokenEstimate: 4,
          success: true,
        };

      case "today": {
        const dateStr = now.toISOString().split("T")[0];
        return {
          value: dateStr,
          summary: dateStr,
          tokenEstimate: 3,
          success: true,
        };
      }

      case "time": {
        const timeStr = now.toTimeString().split(" ")[0];
        return {
          value: timeStr,
          summary: timeStr,
          tokenEstimate: 3,
          success: true,
        };
      }

      case "datetime": {
        const isoStr = now.toISOString();
        return {
          value: isoStr,
          summary: isoStr,
          tokenEstimate: 6,
          success: true,
        };
      }

      case "timestamp": {
        const unix = Math.floor(now.getTime() / 1000);
        return {
          value: unix,
          summary: String(unix),
          tokenEstimate: 3,
          success: true,
        };
      }

      default:
        return {
          value: "",
          summary: "Unknown resource",
          tokenEstimate: 0,
          success: false,
          error: `Unknown time resource: ${resourceName}`,
        };
    }
  },
};

// ============================================================================
// CONFIG PROVIDER (Static with overrides)
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Record<string, unknown> = {
  theme: "light",
  language: "en",
  debug: false,
  maxTokens: 4096,
  timeout: 30000,
};

/**
 * Configuration resource provider
 */
export const configProvider: ResourceProvider<unknown> = {
  name: "config",

  definitions: [
    {
      name: "config",
      description: "Get configuration value",
      hasArgs: true,
      argPattern: /^[\w-]+$/,
      argDescription: "<config-key>",
      examples: ["@config(theme)", "@config(language)", "@config(debug)"],
      isAsync: false,
      category: "system",
    },
  ],

  handles(resourceName: string): boolean {
    return resourceName === "config";
  },

  get(
    _resourceName: string,
    args: string[],
    context: ResourceContext
  ): ResolvedResource<unknown> {
    const key = args[0];

    // Check context for config override
    const configOverrides = context.config as Record<string, unknown> | undefined;
    const value = configOverrides?.[key] ?? DEFAULT_CONFIG[key];

    if (value === undefined) {
      return {
        value: null,
        summary: `Unknown config: ${key}`,
        tokenEstimate: 0,
        success: false,
        error: `Unknown config key: ${key}. Available: ${Object.keys(DEFAULT_CONFIG).join(", ")}`,
      };
    }

    return {
      value,
      summary: `${key}=${JSON.stringify(value)}`,
      tokenEstimate: 3,
      success: true,
    };
  },

  validate(_resourceName: string, args: string[]): { valid: boolean; error?: string } {
    const key = args[0];
    if (DEFAULT_CONFIG[key] !== undefined) {
      return { valid: true };
    }
    return { valid: false, error: `Unknown config key: ${key}` };
  },

  suggest(_resourceName: string, partial: string): string[] {
    const search = partial.toLowerCase();
    return Object.keys(DEFAULT_CONFIG).filter((key) =>
      key.toLowerCase().startsWith(search)
    );
  },
};

// ============================================================================
// ENVIRONMENT PROVIDER
// ============================================================================

/**
 * Environment variable resource provider
 */
export const envProvider: ResourceProvider<string> = {
  name: "env",

  definitions: [
    {
      name: "env",
      description: "Get environment variable value",
      hasArgs: true,
      argPattern: /^[A-Z_][A-Z0-9_]*$/i,
      argDescription: "<VAR_NAME>",
      examples: ["@env(NODE_ENV)", "@env(HOME)", "@env(USER)"],
      isAsync: false,
      category: "system",
    },
  ],

  handles(resourceName: string): boolean {
    return resourceName === "env";
  },

  get(
    _resourceName: string,
    args: string[],
    _context: ResourceContext
  ): ResolvedResource<string> {
    const varName = args[0];
    const value = process.env[varName];

    if (value === undefined) {
      return {
        value: "",
        summary: `Env var not set: ${varName}`,
        tokenEstimate: 0,
        success: false,
        error: `Environment variable ${varName} is not set`,
      };
    }

    // Mask sensitive values
    const isSensitive =
      varName.includes("KEY") ||
      varName.includes("SECRET") ||
      varName.includes("TOKEN") ||
      varName.includes("PASSWORD");

    if (isSensitive) {
      return {
        value,
        summary: `${varName}=[REDACTED]`,
        tokenEstimate: 2,
        success: true,
      };
    }

    return {
      value,
      summary: `${varName}=${value}`,
      tokenEstimate: Math.ceil(value.length / 4),
      success: true,
    };
  },
};

// ============================================================================
// UUID PROVIDER
// ============================================================================

/**
 * UUID resource provider
 */
export const uuidProvider: ResourceProvider<string> = {
  name: "uuid",

  definitions: [
    {
      name: "uuid",
      description: "Generate a random UUID",
      hasArgs: false,
      examples: ["@uuid"],
      isAsync: false,
      category: "utility",
    },
    {
      name: "id",
      description: "Generate a short random ID",
      hasArgs: false,
      examples: ["@id"],
      isAsync: false,
      category: "utility",
    },
  ],

  handles(resourceName: string): boolean {
    return resourceName === "uuid" || resourceName === "id";
  },

  get(
    resourceName: string,
    _args: string[],
    _context: ResourceContext
  ): ResolvedResource<string> {
    if (resourceName === "uuid") {
      const uuid = crypto.randomUUID();
      return {
        value: uuid,
        summary: uuid,
        tokenEstimate: 9,
        success: true,
      };
    }

    if (resourceName === "id") {
      const id = Math.random().toString(36).substring(2, 10);
      return {
        value: id,
        summary: id,
        tokenEstimate: 2,
        success: true,
      };
    }

    return {
      value: "",
      summary: "Unknown resource",
      tokenEstimate: 0,
      success: false,
      error: `Unknown resource: ${resourceName}`,
    };
  },
};

// ============================================================================
// CANVAS PROVIDER (Async with executor)
// ============================================================================

/**
 * Canvas resource provider for canvas-related aliases
 * Uses executor from context to fetch canvas data
 */
export const canvasProvider: ResourceProvider = {
  name: "canvas",

  definitions: [
    {
      name: "selection",
      description: "Get currently selected canvas elements",
      hasArgs: false,
      examples: ["@selection"],
      isAsync: true,
      category: "canvas",
    },
    {
      name: "canvas",
      description: "Get canvas state summary",
      hasArgs: false,
      examples: ["@canvas"],
      isAsync: true,
      category: "canvas",
    },
    {
      name: "element",
      description: "Get specific element by ID",
      hasArgs: true,
      argPattern: /^[\w-]+$/,
      argDescription: "<element-id>",
      examples: ["@element(rect-1)", "@element(text-abc)"],
      isAsync: true,
      category: "canvas",
    },
  ],

  handles(resourceName: string): boolean {
    return ["selection", "canvas", "element"].includes(resourceName);
  },

  async get(
    resourceName: string,
    args: string[],
    context: ResourceContext
  ): Promise<ResolvedResource> {
    const executor = context.executor as {
      execute: (cmd: string, input?: unknown) => Promise<unknown>;
    } | undefined;

    if (!executor) {
      return {
        value: null,
        summary: "No executor available",
        tokenEstimate: 0,
        success: false,
        error: `No executor available for @${resourceName}`,
      };
    }

    try {
      if (resourceName === "selection") {
        const elements = await executor.execute("getSelection");
        const elemArray = elements as unknown[];
        return {
          value: elements,
          summary: `${elemArray.length} element(s) selected`,
          tokenEstimate: Math.ceil(JSON.stringify(elements).length / 4),
          success: true,
        };
      }

      if (resourceName === "canvas") {
        const state = await executor.execute("getCanvasState");
        return {
          value: state,
          summary: "Canvas state",
          tokenEstimate: Math.ceil(JSON.stringify(state).length / 4),
          success: true,
        };
      }

      if (resourceName === "element") {
        const elementId = args[0];
        const element = await executor.execute("getElement", { id: elementId });
        if (!element) {
          return {
            value: null,
            summary: `Element ${elementId} not found`,
            tokenEstimate: 0,
            success: false,
            error: `Element ${elementId} not found on canvas`,
          };
        }
        return {
          value: element,
          summary: `Element ${elementId}`,
          tokenEstimate: Math.ceil(JSON.stringify(element).length / 4),
          success: true,
        };
      }

      return {
        value: null,
        summary: "Unknown resource",
        tokenEstimate: 0,
        success: false,
        error: `Unknown canvas resource: ${resourceName}`,
      };
    } catch (error) {
      throw error; // Let the caller handle retries
    }
  },
};

// ============================================================================
// EXPORT ALL PROVIDERS
// ============================================================================

/**
 * All built-in providers
 */
export const builtInProviders: ResourceProvider[] = [
  colorProvider,
  timeProvider,
  configProvider,
  envProvider,
  uuidProvider,
  canvasProvider,
];

/**
 * Register all built-in providers with a registry
 */
export function registerBuiltInProviders(
  registry: { register: (provider: ResourceProvider) => void }
): void {
  for (const provider of builtInProviders) {
    registry.register(provider);
  }
}

/**
 * Get available color names
 */
export function getColorNames(): string[] {
  return Object.keys(COLORS);
}

/**
 * Get available palette names
 */
export function getPaletteNames(): string[] {
  return Object.keys(PALETTES);
}
