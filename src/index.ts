#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'url';
import { SCBApiClient } from './api-client.js';
import { resources, getResourceContent } from './resources.js';

// ============================================================================
// CONSTANTS AND HELPERS
// ============================================================================

const SUPPORTED_LANGUAGES = ['sv', 'en'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
const DEFAULT_LANGUAGE: SupportedLanguage = 'sv';
const MAX_PAGE_SIZE = 100;

// Structured error types for consistent error handling
interface MCPError {
  type: string;
  message: string;
  details?: Record<string, any>;
  suggestions?: string[];
}

// Helper function to validate language parameter
function validateLanguage(language: string | undefined): { valid: boolean; language: SupportedLanguage; warning?: string } {
  if (!language) {
    return { valid: true, language: DEFAULT_LANGUAGE };
  }

  const langLower = language.toLowerCase() as SupportedLanguage;
  if (SUPPORTED_LANGUAGES.includes(langLower)) {
    return { valid: true, language: langLower };
  }

  // Return error for unsupported language
  return {
    valid: false,
    language: DEFAULT_LANGUAGE,
    warning: `Unsupported language '${language}'. Only 'sv' (Swedish) and 'en' (English) are supported. Defaulting to '${DEFAULT_LANGUAGE}'.`
  };
}

// Helper function to create structured error response
function createErrorResponse(error: MCPError) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error }, null, 2)
      },
    ],
  };
}

// Helper function to normalize Swedish characters for fuzzy matching
function normalizeSwedish(str: string): string {
  return str.toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/ü/g, 'u')
    .trim();
}

// Helper function for fuzzy region matching
function fuzzyMatchRegion(query: string, regionName: string, regionCode: string): boolean {
  const normalizedQuery = normalizeSwedish(query);
  const normalizedName = normalizeSwedish(regionName);
  const normalizedCode = regionCode.toLowerCase();

  // Exact match (case-insensitive, diacritic-insensitive)
  if (normalizedName === normalizedQuery || normalizedCode === normalizedQuery) {
    return true;
  }

  // Contains match
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
    return true;
  }

  // Code match
  if (normalizedCode.includes(normalizedQuery)) {
    return true;
  }

  return false;
}

export class SCBMCPServer {
  private server: Server;
  private apiClient: SCBApiClient;
  
  constructor() {
    this.server = new Server(
      {
        name: 'SCB MCP Server',
        version: '2.4.2',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.apiClient = new SCBApiClient();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: resources,
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const content = getResourceContent(uri);

      if (!content) {
        throw new Error(`Resource not found: ${uri}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: content.mimeType,
            text: content.content,
          },
        ],
      };
    });

    // List available prompts (none for now)  
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.callTool(name, args);
    });
  }

  public getTools(): Tool[] {
    return [
      {
        name: 'scb_get_api_status',
        description: 'Get API configuration and rate limit information from Statistics Sweden',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'scb_search_tables',
        description: 'Search for statistical tables in the SCB database. TIP: Swedish search terms work best (e.g., "befolkning" instead of "population", "arbetslöshet" instead of "unemployment")',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search term - Swedish terms recommended (e.g., "befolkning", "arbetslöshet", "inkomst"). English works but Swedish gives better results.',
            },
            pastDays: {
              type: 'number',
              description: 'Only show tables updated in the last N days',
            },
            includeDiscontinued: {
              type: 'boolean',
              description: 'Include discontinued tables',
              default: false,
            },
            pageSize: {
              type: 'number',
              description: 'Number of results per page (max 100)',
              default: 20,
            },
            pageNumber: {
              type: 'number',
              description: 'Page number',
              default: 1,
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
            category: {
              type: 'string',
              description: 'Filter by category: "population", "labour", "economy", "housing", "environment", "education", "health"',
            },
          },
        },
      },
      {
        name: 'scb_get_table_info',
        description: 'Get detailed metadata about a specific statistical table',
        inputSchema: {
          type: 'object',
          properties: {
            tableId: {
              type: 'string',
              description: 'Table ID (e.g., "BE0101N1")',
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
          },
          required: ['tableId'],
        },
      },
      {
        name: 'scb_get_table_data',
        description: 'Get statistical data from a table with optional filtering. Without selection, returns a smart default subset (latest time period, all categories). Use scb_preview_data for a quick preview first.',
        inputSchema: {
          type: 'object',
          properties: {
            tableId: {
              type: 'string',
              description: 'Table ID (e.g., "BE0101N1")',
            },
            selection: {
              type: 'object',
              description: 'Variable selection (variable_name: [value1, value2]). Use * for all values, or expressions like "TOP(5)"',
              additionalProperties: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
          },
          required: ['tableId'],
        },
      },
      {
        name: 'scb_check_usage',
        description: 'Check current API usage and rate limit status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'scb_search_regions',
        description: 'Search for region codes by name (e.g., find code for "Lerum", "Stockholm"). Supports fuzzy matching for Swedish characters.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Region name to search for (e.g., "Lerum", "Stockholm", "Goteborg")',
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'scb_get_table_variables',
        description: 'Get available variables and their possible values for a table (essential before fetching data)',
        inputSchema: {
          type: 'object',
          properties: {
            tableId: {
              type: 'string',
              description: 'Table ID (e.g., "TAB6534")',
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
            variableName: {
              type: 'string',
              description: 'Optional: Show values for specific variable only (e.g., "region", "kön")',
            },
          },
          required: ['tableId'],
        },
      },
      {
        name: 'scb_find_region_code',
        description: 'Find the exact region code for a specific municipality or area. Supports fuzzy matching (e.g., "Goteborg" matches "Göteborg").',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Municipality or region name (e.g., "Lerum", "Stockholm", "Goteborg")',
            },
            tableId: {
              type: 'string',
              description: 'Optional: Specific table to search for region codes (ensures compatibility)',
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'scb_test_selection',
        description: 'Test if a data selection is valid without retrieving data (prevents API errors). Always use this before scb_get_table_data.',
        inputSchema: {
          type: 'object',
          properties: {
            tableId: {
              type: 'string',
              description: 'Table ID (e.g., "TAB1267")',
            },
            selection: {
              type: 'object',
              description: 'Variable selection to test (required). Format: { "VariableName": ["value1", "value2"] }',
              additionalProperties: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
          },
          required: ['tableId', 'selection'],
        },
      },
      {
        name: 'scb_preview_data',
        description: 'Get a small preview of data (max ~50 rows) to verify table structure and selection before fetching full data. Safer than scb_get_table_data for initial exploration.',
        inputSchema: {
          type: 'object',
          properties: {
            tableId: {
              type: 'string',
              description: 'Table ID (e.g., "TAB1267")',
            },
            selection: {
              type: 'object',
              description: 'Optional variable selection (automatically limited to small sample)',
              additionalProperties: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            language: {
              type: 'string',
              description: 'Language code: "sv" (Swedish, recommended) or "en" (English)',
              default: 'sv',
            },
          },
          required: ['tableId'],
        },
      },
    ];
  }

  public async callTool(name: string, args: any) {
    try {
      switch (name) {
        case 'scb_get_api_status':
          return await this.handleGetApiStatus();

        case 'scb_search_tables':
          return await this.handleSearchTables(args as any);

        case 'scb_get_table_info':
          return await this.handleGetTableInfo(args as any);

        case 'scb_get_table_data':
          return await this.handleGetTableData(args as any);

        case 'scb_check_usage':
          return await this.handleCheckUsage();

        case 'scb_search_regions':
          return await this.handleSearchRegions(args as any);

        case 'scb_get_table_variables':
          return await this.handleGetTableVariables(args as any);

        case 'scb_find_region_code':
          return await this.handleFindRegionCode(args as any);

        case 'scb_test_selection':
          return await this.handleTestSelection(args as any);

        case 'scb_preview_data':
          return await this.handlePreviewData(args as any);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async handleGetApiStatus() {
    const config = await this.apiClient.getConfig();
    const usage = this.apiClient.getUsageInfo();
    
    return {
      content: [
        {
          type: 'text',
          text: `**SCB API Status**

**Configuration:**
- API Version: ${config.apiVersion}
- Default Language: ${config.defaultLanguage}
- Available Languages: ${config.languages.map(l => `${l.id} (${l.label})`).join(', ')}
- Max Data Cells per Request: ${config.maxDataCells.toLocaleString()}
- Rate Limit: ${config.maxCallsPerTimeWindow} calls per ${config.timeWindow} seconds
- License: ${config.license}

**Current Usage:**
- Requests Made: ${usage.requestCount}/${usage.rateLimitInfo?.maxCalls || config.maxCallsPerTimeWindow}
- Remaining Requests: ${usage.rateLimitInfo?.remaining || 'Unknown'}
- Window Started: ${usage.windowStart.toISOString()}

${config.sourceReferences?.length ? `**Citation:**\n${config.sourceReferences.map(ref => `- ${ref.language}: ${ref.text}`).join('\n')}` : ''}`,
        },
      ],
    };
  }

  private async handleSearchTables(args: any) {
    // Validate language
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;

    // Validate and cap pageSize
    let pageSize = args.pageSize || 20;
    if (pageSize > MAX_PAGE_SIZE) {
      pageSize = MAX_PAGE_SIZE;
    }

    const result = await this.apiClient.searchTables({
      ...args,
      language,
      pageSize
    });

    // Filter by category if specified - expanded keyword matching
    let filteredTables = result.tables;
    if (args.category) {
      const categoryLower = args.category.toLowerCase();

      // Category keyword mappings (Swedish and English terms)
      const categoryKeywords: Record<string, string[]> = {
        'population': ['population', 'befolkning', 'invånare', 'folk', 'demographic', 'demografi', 'födelse', 'birth', 'död', 'death', 'migration', 'flyttning', 'ålder', 'age', 'kön', 'sex', 'gender'],
        'labour': ['labour', 'labor', 'employment', 'arbete', 'arbets', 'sysselsättning', 'sysselsatt', 'arbetslös', 'unemployment', 'yrke', 'occupation', 'lön', 'wage', 'salary'],
        'economy': ['gdp', 'bnp', 'income', 'inkomst', 'ekonomi', 'economy', 'economic', 'finans', 'finance', 'skatt', 'tax', 'pris', 'price', 'inflation', 'handel', 'trade', 'export', 'import', 'företag', 'business', 'närings'],
        'housing': ['housing', 'bostad', 'boende', 'dwelling', 'lägenhet', 'apartment', 'hus', 'house', 'hyra', 'rent', 'fastighet', 'property', 'byggnation', 'construction'],
        'environment': ['miljö', 'environment', 'utsläpp', 'emission', 'klimat', 'climate', 'energi', 'energy', 'avfall', 'waste', 'vatten', 'water', 'luft', 'air'],
        'education': ['utbildning', 'education', 'skola', 'school', 'student', 'elev', 'universitet', 'university', 'högskola', 'examen', 'degree'],
        'health': ['hälsa', 'health', 'sjukvård', 'healthcare', 'sjukdom', 'disease', 'vård', 'care', 'dödsorsak', 'cause of death']
      };

      const keywords = categoryKeywords[categoryLower] || [categoryLower];

      filteredTables = result.tables.filter(table => {
        const searchText = [
          table.label,
          table.description || '',
          ...(table.variableNames || [])
        ].join(' ').toLowerCase();

        return keywords.some(keyword => searchText.includes(keyword));
      });
    }
    
    const displayTables = filteredTables.slice(0, pageSize);

    // Transform to structured data
    const structuredData = {
      query: {
        search_term: args.query || null,
        category_filter: args.category || null,
        page_size: pageSize,
        page_number: result.page.pageNumber,
        language_used: language,
        language_warning: langValidation.warning || null
      },
      tables: displayTables.map(table => ({
        id: table.id,
        title: table.label,
        description: table.description || null,
        period: {
          start: table.firstPeriod || null,
          end: table.lastPeriod || null
        },
        variables: table.variableNames || [],
        updated: table.updated || null,
        source: table.source || null,
        discontinued: table.discontinued || false,
        category: table.category || null
      })),
      pagination: {
        current_page: result.page.pageNumber,
        total_pages: result.page.totalPages,
        total_results: result.page.totalElements,
        page_size: result.page.pageSize
      },
      metadata: {
        total_filtered: filteredTables.length,
        total_unfiltered: result.tables.length,
        has_category_filter: !!args.category
      }
    };

    // Create user-friendly summary with better category filtering feedback
    let summary = `**🔍 Search Results** ${args.query ? `for "${args.query}"` : ''}${args.category ? ` (${args.category} category)` : ''}

**Found:** ${result.page.totalElements.toLocaleString()} tables${args.category ? ` (${filteredTables.length} match category filter)` : ''} (showing ${displayTables.length})

**Top Results:**`;

    if (displayTables.length === 0 && args.category && result.tables.length > 0) {
      // Category filter removed all results - provide helpful feedback
      summary += `

❌ **No tables match the "${args.category}" category filter**

The search found ${result.tables.length} table(s), but none match the "${args.category}" category criteria.

**💡 Suggestions:**
- Try removing the category filter: search without \`category="${args.category}"\`
- Use broader search terms like "${args.category}" instead of "${args.query}"
- Try related terms: ${args.category === 'population' ? '"befolkning", "demographic", or "region"' : `different ${args.category}-related terms`}

**🔍 What was found:**
${result.tables.slice(0, 3).map(table => `• ${table.label} (${table.id})`).join('\n')}${result.tables.length > 3 ? `\n• ... and ${result.tables.length - 3} more` : ''}`;
    } else if (displayTables.length > 0) {
      summary += `
${displayTables.slice(0, 5).map(table => 
  `📊 **${table.label}** (${table.id})
  - Period: ${table.firstPeriod} - ${table.lastPeriod}
  - Variables: ${(table.variableNames || []).slice(0, 3).join(', ')}${(table.variableNames?.length || 0) > 3 ? '...' : ''}
  - Updated: ${table.updated ? new Date(table.updated).toLocaleDateString() : 'N/A'}${table.discontinued ? ' ⚠️ DISCONTINUED' : ''}`
).join('\n\n')}`;
    }

    summary += `

📍 **Page ${result.page.pageNumber} of ${result.page.totalPages}**

${result.page.totalElements > 50 ? `💡 **Search Tips:**
- Try more specific terms: "${args.query || 'keyword'} municipality"
- Use category filters: population, labour, economy, housing
- Browse folders with \`scb_browse_folders\` for organized view` : ''}`;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredData, null, 2)
        },
      ],
    };
  }

  private async handleGetTableInfo(args: { tableId: string; language?: string }) {
    const { tableId } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;

    try {
      const metadata = await this.apiClient.getTableMetadata(tableId, language);

      const variables = Object.entries(metadata.dimension).map(([varCode, varDef]) => {
        const valueCount = Object.keys(varDef.category.index).length;
        return {
          code: varCode,
          label: varDef.label,
          value_count: valueCount
        };
      });

      const totalCells = metadata.size.reduce((a, b) => a * b, 1);

      const structuredData = {
        table_id: tableId,
        table_name: metadata.label,
        language_used: language,
        language_warning: langValidation.warning || null,
        dataset_info: {
          source: metadata.source || 'Statistics Sweden',
          updated: metadata.updated || null,
          total_cells: totalCells
        },
        variables: variables,
        contacts: metadata.extension?.contact?.map(c => ({
          name: c.name || null,
          email: c.mail || null,
          phone: c.phone || null
        })) || [],
        notes: metadata.extension?.notes?.map(note => ({
          text: note.text,
          mandatory: note.mandatory || false
        })) || []
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Parse SCB API error if present
      let scbError = null;
      const scbErrorMatch = errorMessage.match(/(\d{3})\s+\w+:\s*(\{.*\})/);
      if (scbErrorMatch) {
        try {
          scbError = JSON.parse(scbErrorMatch[2]);
        } catch {}
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: scbError?.type || 'table_info_failed',
                message: scbError?.title || errorMessage,
                http_status: scbError?.status || null,
                table_id: tableId,
                language_used: language,
                language_warning: langValidation.warning || null
              },
              suggestions: [
                'Verify the table ID is correct (e.g., "TAB637", "BE0101N1")',
                'Use scb_search_tables to find valid table IDs',
                'Check that the table has not been discontinued'
              ]
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleGetTableData(args: { tableId: string; selection?: Record<string, string[]>; language?: string }) {
    const { tableId, selection } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;

    try {
      const data = await this.apiClient.getTableData(tableId, selection, language);

      // Transform to structured JSON data
      const structuredData = this.apiClient.transformToStructuredData(data, selection);

      // Add language info
      const responseData = {
        ...structuredData,
        query: {
          ...structuredData.query,
          language_used: language,
          language_warning: langValidation.warning || null
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Parse SCB API error if present
      let scbError = null;
      const scbErrorMatch = errorMessage.match(/(\d{3})\s+\w+:\s*(\{.*\})/);
      if (scbErrorMatch) {
        try {
          scbError = JSON.parse(scbErrorMatch[2]);
        } catch {}
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: scbError?.type || 'data_fetch_failed',
                message: scbError?.title || errorMessage,
                http_status: scbError?.status || null,
                table_id: tableId,
                selection: selection || null,
                language_used: language,
                language_warning: langValidation.warning || null
              },
              suggestions: [
                'Use scb_test_selection to validate your selection first',
                'Use scb_get_table_variables to see valid variable values',
                'Try scb_preview_data for a safer initial exploration',
                'Check that region/time codes are valid for this table'
              ]
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCheckUsage() {
    const usage = this.apiClient.getUsageInfo();
    const rateLimitInfo = usage.rateLimitInfo;
    
    return {
      content: [
        {
          type: 'text',
          text: `**API Usage Status**

**Current Window:**
- Requests Made: ${usage.requestCount}
- Window Started: ${usage.windowStart.toISOString()}

${rateLimitInfo ? `**Rate Limits:**
- Max Calls: ${rateLimitInfo.maxCalls}
- Remaining: ${rateLimitInfo.remaining}
- Time Window: ${rateLimitInfo.timeWindow} seconds
- Reset Time: ${rateLimitInfo.resetTime.toISOString()}

**Usage:** ${usage.requestCount}/${rateLimitInfo.maxCalls} (${Math.round((usage.requestCount / rateLimitInfo.maxCalls) * 100)}%)` : '**Rate limit information not available yet**'}

${usage.requestCount > 0 ? `⚠️ **Tip:** To avoid rate limits, space out your requests and use specific selections to reduce API calls.` : ''}`,
        },
      ],
    };
  }

  private async handleSearchRegions(args: { query: string; language?: string }) {
    const { query } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;

    // Common regions for fallback and fuzzy matching
    const commonRegions = [
      { code: '00', name: 'Riket (hela Sverige)', type: 'country' },
      { code: '01', name: 'Stockholms län', type: 'county' },
      { code: '03', name: 'Uppsala län', type: 'county' },
      { code: '04', name: 'Södermanlands län', type: 'county' },
      { code: '05', name: 'Östergötlands län', type: 'county' },
      { code: '06', name: 'Jönköpings län', type: 'county' },
      { code: '07', name: 'Kronobergs län', type: 'county' },
      { code: '08', name: 'Kalmar län', type: 'county' },
      { code: '09', name: 'Gotlands län', type: 'county' },
      { code: '10', name: 'Blekinge län', type: 'county' },
      { code: '12', name: 'Skåne län', type: 'county' },
      { code: '13', name: 'Hallands län', type: 'county' },
      { code: '14', name: 'Västra Götalands län', type: 'county' },
      { code: '17', name: 'Värmlands län', type: 'county' },
      { code: '18', name: 'Örebro län', type: 'county' },
      { code: '19', name: 'Västmanlands län', type: 'county' },
      { code: '20', name: 'Dalarnas län', type: 'county' },
      { code: '21', name: 'Gävleborgs län', type: 'county' },
      { code: '22', name: 'Västernorrlands län', type: 'county' },
      { code: '23', name: 'Jämtlands län', type: 'county' },
      { code: '24', name: 'Västerbottens län', type: 'county' },
      { code: '25', name: 'Norrbottens län', type: 'county' },
      { code: '0180', name: 'Stockholm', type: 'municipality' },
      { code: '1480', name: 'Göteborg', type: 'municipality' },
      { code: '1280', name: 'Malmö', type: 'municipality' },
      { code: '1441', name: 'Lerum', type: 'municipality' },
      { code: '1484', name: 'Lysekil', type: 'municipality' },
      { code: '0380', name: 'Uppsala', type: 'municipality' },
      { code: '1281', name: 'Lund', type: 'municipality' },
      { code: '0580', name: 'Linköping', type: 'municipality' },
      { code: '1880', name: 'Örebro', type: 'municipality' },
      { code: '0680', name: 'Jönköping', type: 'municipality' },
      { code: '2580', name: 'Luleå', type: 'municipality' },
      { code: '2480', name: 'Umeå', type: 'municipality' },
    ];

    try {
      // First, try fuzzy matching against common regions
      const fuzzyMatches = commonRegions.filter(region =>
        fuzzyMatchRegion(query, region.name, region.code)
      );

      // Also try API search
      let apiRegions: Array<{ code: string; name: string; type: string }> = [];
      try {
        apiRegions = await this.apiClient.searchRegions(query, language);
      } catch {
        // API search failed, continue with fuzzy matches
      }

      // Combine results, prioritizing fuzzy matches
      const allMatches = new Map<string, { code: string; name: string; type: string }>();

      // Add fuzzy matches first
      for (const match of fuzzyMatches) {
        allMatches.set(match.code, match);
      }

      // Add API results
      for (const region of apiRegions) {
        if (!allMatches.has(region.code)) {
          allMatches.set(region.code, region);
        }
      }

      const regions = Array.from(allMatches.values());

      if (regions.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: query,
                matches: [],
                message: `No regions found matching "${query}"`,
                language_used: language,
                language_warning: langValidation.warning || null,
                common_regions: commonRegions.slice(0, 10),
                tips: [
                  'Try Swedish spelling (e.g., "Göteborg" instead of "Gothenburg")',
                  'Fuzzy matching works: "Goteborg" will match "Göteborg"',
                  'Use scb_find_region_code with a tableId for table-specific regions',
                  'Region codes: 2 digits = county (län), 4 digits = municipality (kommun)'
                ]
              }, null, 2)
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query: query,
              total_matches: regions.length,
              language_used: language,
              language_warning: langValidation.warning || null,
              regions: regions.slice(0, 20).map(r => ({
                code: r.code,
                name: r.name,
                type: r.type,
                usage_example: { Region: [r.code] }
              })),
              tips: [
                'Use the "code" value in your data selections',
                'Format: {"Region": ["' + regions[0].code + '"]}',
                'You can select multiple regions: {"Region": ["code1", "code2"]}'
              ]
            }, null, 2)
          },
        ],
      };
    } catch (error) {
      return createErrorResponse({
        type: 'region_search_failed',
        message: error instanceof Error ? error.message : String(error),
        details: { query, language },
        suggestions: [
          'Try scb_find_region_code with a specific tableId for more reliable results',
          'Check spelling or try Swedish names (e.g., "Göteborg")'
        ]
      });
    }
  }

  private async handleGetTableVariables(args: { tableId: string; language?: string; variableName?: string }) {
    const { tableId, variableName } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;
    
    try {
      // Get table metadata to extract variable information
      const metadata = await this.apiClient.getTableMetadata(tableId, language);
      
      if (!metadata.dimension) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                table_id: tableId,
                error: "No variable information available for this table",
                suggestion: "Try using scb_get_table_info for general table information"
              }, null, 2)
            },
          ],
        };
      }

      const variables = Object.entries(metadata.dimension);
      
      // Filter to specific variable if requested
      const filteredVariables = variableName 
        ? variables.filter(([code, def]) => 
            code.toLowerCase() === variableName.toLowerCase() ||
            def.label.toLowerCase().includes(variableName.toLowerCase())
          )
        : variables;

      if (filteredVariables.length === 0) {
        const availableVars = variables.map(([code, def]) => ({ code, label: def.label }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                table_id: tableId,
                error: `Variable "${variableName}" not found`,
                available_variables: availableVars
              }, null, 2)
            },
          ],
        };
      }

      // Transform variables into structured JSON
      const variableData = filteredVariables.map(([varCode, varDef]) => {
        const values = Object.entries(varDef.category.index);
        const labels = varDef.category.label || {};
        
        // Get all values with their labels
        const allValues = values.map(([code, index]) => ({
          code,
          label: labels[code] || code,
          index
        }));
        
        return {
          variable_code: varCode,
          variable_name: varDef.label,
          variable_type: varCode.toLowerCase(),
          total_values: values.length,
          sample_values: allValues.slice(0, 10), // Show first 10 values
          has_more: values.length > 10,
          usage_example: {
            single_value: { [varCode]: [values[0]?.[0] || "value"] },
            multiple_values: { [varCode]: ["value1", "value2"] },
            all_values: { [varCode]: ["*"] },
            top_values: { [varCode]: ["TOP(5)"] }
          }
        };
      });

      const responseData = {
        table_id: tableId,
        table_name: metadata.label,
        query: {
          variable_filter: variableName || null,
          language_used: language,
          language_warning: langValidation.warning || null
        },
        variables: variableData,
        metadata: {
          total_variables: variables.length,
          filtered_variables: filteredVariables.length,
          source: metadata.source || "Statistics Sweden",
          updated: metadata.updated
        }
      };

      const summary = `**🔍 Table Variables for ${tableId}**

**Table:** ${metadata.label}
${variableName ? `**Filtered for:** ${variableName}` : '**All Variables**'}

${variableData.map(v => 
  `**${v.variable_code}** (${v.variable_name})
  - Values: ${v.total_values.toLocaleString()}
  - Sample: ${v.sample_values.slice(0, 3).map(s => s.label).join(', ')}${v.has_more ? '...' : ''}
  - Usage: {"${v.variable_code}": ["${v.sample_values[0]?.code || 'value'}"]}
`).join('\n')}

💡 **Total Variables:** ${variables.length} available`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          },
        ],
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: "table_variables_failed",
                message: errorMessage,
                table_id: tableId,
                language_used: language,
                language_warning: langValidation.warning || null
              },
              suggestions: [
                'Verify the table ID is correct (e.g., "TAB637", "BE0101N1")',
                'Use scb_search_tables to find valid table IDs',
                'Check that the table has not been discontinued'
              ]
            }, null, 2)
          },
        ],
      };
    }
  }

  private async handleFindRegionCode(args: { query: string; tableId?: string; language?: string }) {
    const { query, tableId } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;
    
    try {
      let targetTableId: string;
      
      if (tableId) {
        // Use the specified table directly
        targetTableId = tableId;
      } else {
        // Look for a common population table that has region data
        const searchResults = await this.apiClient.searchTables({
          query: 'population municipality region',
          pageSize: 10,
          lang: language
        });

        // Find tables with Region variable
        const regionTables = searchResults.tables.filter(table => 
          table.variableNames?.some(v => v.toLowerCase().includes('region')) &&
          (table.label.toLowerCase().includes('population') || table.label.toLowerCase().includes('befolkning'))
        );

        if (regionTables.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: query,
                matches: [],
                error: "No suitable regional tables found",
                language_used: language,
                language_warning: langValidation.warning || null,
                common_codes: [
                  { code: "0180", name: "Stockholm" },
                  { code: "1480", name: "Gothenburg" },
                  { code: "1280", name: "Malmö" },
                  { code: "1441", name: "Lerum" },
                  { code: "0380", name: "Uppsala" }
                ],
                suggestion: "Use scb_search_regions to find relevant tables manually"
              }, null, 2)
            },
          ],
        };
        }

        // Use the first suitable table to get region information
        targetTableId = regionTables[0].id;
      }

      // Now use targetTableId (either specified or found)
      const metadata = await this.apiClient.getTableMetadata(targetTableId, language);
      
      if (!metadata.dimension || !metadata.dimension['Region']) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: query,
                error: `Could not access region data from table ${targetTableId}`,
                language_used: language,
                language_warning: langValidation.warning || null,
                suggestion: `Use scb_get_table_variables with tableId="${targetTableId}" to explore available regions manually`,
                source_table: targetTableId
              }, null, 2)
            },
          ],
        };
      }

      const regionDimension = metadata.dimension['Region'];
      const regionEntries = Object.entries(regionDimension.category.index);
      const regionLabels = regionDimension.category.label || {};

      // Search for the query in region labels and codes using fuzzy matching
      const exactMatches = regionEntries.filter(([code]) => {
        const label = regionLabels[code] || '';
        return fuzzyMatchRegion(query, label, code);
      });

      if (exactMatches.length === 0) {
        // Do a word-based search for partial matches
        const partialMatches = regionEntries.filter(([code]) => {
          const label = regionLabels[code] || '';
          const queryWords = normalizeSwedish(query).split(' ');
          const normalizedLabel = normalizeSwedish(label);
          return queryWords.some(word =>
            normalizedLabel.includes(word) || code.includes(word)
          );
        }).slice(0, 10);

        if (partialMatches.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  query: query,
                  matches: [],
                  error: `No regions found matching "${query}"`,
                  language_used: language,
                  language_warning: langValidation.warning || null,
                  common_codes: [
                    { code: "0180", name: "Stockholm" },
                    { code: "1480", name: "Gothenburg (Göteborg)" },
                    { code: "1280", name: "Malmö" },
                    { code: "1441", name: "Lerum" },
                    { code: "0380", name: "Uppsala" }
                  ],
                  source_table: {
                    id: targetTableId,
                    name: metadata.label
                  },
                  suggestion: `Use scb_get_table_variables with tableId="${targetTableId}" and variableName="Region" to see all available regions`
                }, null, 2)
              },
            ],
          };
        }

        const partialResults = partialMatches.map(([code, index]) => ({
          code,
          name: regionLabels[code] || 'Unknown region',
          match_type: 'partial'
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: query,
                matches: partialResults,
                match_type: 'partial_matches',
                primary_match: partialResults[0],
                usage_example: { Region: [partialResults[0].code] },
                language_used: language,
                language_warning: langValidation.warning || null,
                source_table: {
                  id: targetTableId,
                  name: metadata.label
                }
              }, null, 2)
            },
          ],
        };
      }

      // Found exact or close matches
      const exactResults = exactMatches.slice(0, 5).map(([code, index]) => ({
        code,
        name: regionLabels[code] || 'Unknown region',
        match_type: 'exact'
      }));

      const structuredData = {
        query: query,
        matches: exactResults,
        match_type: 'exact_matches',
        total_matches: exactMatches.length,
        primary_match: exactResults[0],
        usage_example: { Region: [exactResults[0].code] },
        language_used: language,
        language_warning: langValidation.warning || null,
        source_table: {
          id: targetTableId,
          name: metadata.label
        }
      };

      const summary = `**🎯 Region Code Found for "${query}"**

✅ **Primary Match:** ${exactResults[0].code} - ${exactResults[0].name}

**All Matches:**
${exactResults.map(r => `- **${r.code}**: ${r.name}`).join('\n')}

💡 **Usage Example:** \`{"Region": ["${exactResults[0].code}"]}\`

📊 **Source:** ${metadata.label} (${targetTableId})${tableId ? '\n⚠️ **Note:** Searched in specified table for compatibility' : '\n💡 **Note:** Searched in default population table'}`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredData, null, 2)
          },
        ],
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: "region_search_failed",
                message: errorMessage,
                query: query,
                language_used: language,
                language_warning: langValidation.warning || null
              },
              suggestions: [
                "Try scb_search_regions to find relevant tables manually",
                "Verify the tableId if you provided one"
              ]
            }, null, 2)
          },
        ],
      };
    }
  }

  private async handleTestSelection(args: { tableId: string; selection?: Record<string, string[]>; language?: string }) {
    const { tableId, selection } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;

    // Check if selection is provided and valid
    if (!selection || typeof selection !== 'object' || Object.keys(selection).length === 0) {
      return createErrorResponse({
        type: 'invalid_selection',
        message: 'The "selection" parameter is required and must be a non-empty object',
        details: {
          provided: selection,
          expected: '{ "VariableName": ["value1", "value2"] }'
        },
        suggestions: [
          'Use scb_get_table_variables to see available variables and their values',
          'Example: { "Region": ["0180"], "Tid": ["2024"] }',
          'Use "*" for all values or "TOP(5)" for latest 5'
        ]
      });
    }

    try {
      // Use the existing validation logic
      const validation = await this.apiClient.validateSelection(tableId, selection, language);

      // Return structured JSON response
      const responseData = {
        table_id: tableId,
        is_valid: validation.isValid,
        language_used: language,
        language_warning: langValidation.warning || null,
        selection: selection,
        translated_selection: validation.translatedSelection || null,
        errors: validation.errors || [],
        suggestions: validation.suggestions || [],
        next_step: validation.isValid
          ? 'Use scb_get_table_data or scb_preview_data with this selection'
          : 'Fix the errors above before requesting data'
      };

      const statusIcon = validation.isValid ? '✅' : '❌';
      const statusText = validation.isValid ? 'VALID' : 'INVALID';

      let responseText = `**Selection Validation for ${tableId}**

${statusIcon} **Status:** ${statusText}

**Your selection:**
${Object.entries(selection).map(([key, values]) => `- ${key}: [${values.join(', ')}]`).join('\n')}`;

      if (!validation.isValid) {
        responseText += `\n\n**❌ Errors:**\n${validation.errors.map(e => `- ${e}`).join('\n')}`;
      }

      if (validation.suggestions.length > 0) {
        responseText += `\n\n**💡 Suggestions:**\n${validation.suggestions.map(s => `- ${s}`).join('\n')}`;
      }

      if (validation.translatedSelection && JSON.stringify(validation.translatedSelection) !== JSON.stringify(selection)) {
        responseText += `\n\n**🔄 Translated selection:**\n${Object.entries(validation.translatedSelection).map(([key, values]) => `- ${key}: [${values.join(', ')}]`).join('\n')}`;
      }

      if (validation.isValid) {
        responseText += `\n\n**✅ This selection should work with \`scb_get_table_data\` or \`scb_preview_data\`!**`;
      } else {
        responseText += `\n\n**🔧 Fix the errors above before requesting data.**`;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: 'selection_validation_failed',
                message: errorMessage,
                table_id: tableId,
                language_used: language,
                language_warning: langValidation.warning || null
              },
              suggestions: [
                'Verify the table ID is correct',
                'Use scb_get_table_variables to check available variables',
                'Try scb_search_tables to find valid table IDs'
              ]
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handlePreviewData(args: { tableId: string; selection?: Record<string, string[]>; language?: string }) {
    const { tableId, selection } = args;
    const langValidation = validateLanguage(args.language);
    const language = langValidation.language;
    
    try {
      // Create a limited selection for preview
      let previewSelection = selection;
      
      if (selection) {
        // Limit each variable to at most 3 values or use special expressions
        previewSelection = {};
        for (const [key, values] of Object.entries(selection)) {
          if (values.some(v => v === '*' || v.startsWith('TOP(') || v.startsWith('BOTTOM('))) {
            // Replace * with TOP(3) for preview, keep other expressions
            previewSelection[key] = values.map(v => v === '*' ? 'TOP(3)' : v);
          } else {
            // Limit to first 3 values
            previewSelection[key] = values.slice(0, 3);
          }
        }
      }

      // Get a small sample of data
      const data = await this.apiClient.getTableData(tableId, previewSelection, language);
      
      // Transform to structured JSON data with preview flag
      const structuredData = this.apiClient.transformToStructuredData(data, previewSelection);
      
      // Add preview metadata and language info
      const previewData = {
        ...structuredData,
        query: {
          ...structuredData.query,
          language_used: language,
          language_warning: langValidation.warning || null
        },
        preview_info: {
          is_preview: true,
          original_selection: selection,
          preview_selection: previewSelection,
          note: "This is a limited preview. Use scb_get_table_data for full dataset."
        }
      };

      const summary = `**👀 Data Preview for ${tableId}**

**Table:** ${structuredData.metadata.table_name}
**Preview Records:** ${structuredData.summary.total_records.toLocaleString()} data points (limited sample)

${selection ? `**Original Selection:**
${Object.entries(selection).map(([key, values]) => `- ${key}: ${values.join(', ')}`).join('\n')}

**Preview Selection:**
${Object.entries(previewSelection || {}).map(([key, values]) => `- ${key}: ${values.join(', ')}`).join('\n')}` : '**Full Dataset Preview**'}

**Sample Data:**
${structuredData.data.slice(0, 5).map(record => {
  const mainValue = record.value ? `Value: ${record.value}` : '';
  const otherFields = Object.entries(record)
    .filter(([key]) => key !== 'value')
    .map(([key, val]) => `${key}: ${val}`)
    .slice(0, 2)
    .join(', ');
  return `- ${otherFields}${mainValue ? `, ${mainValue}` : ''}`;
}).join('\n')}

✅ **Preview looks good!** Use \`scb_get_table_data\` for the complete dataset.`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(previewData, null, 2)
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: "preview_failed",
                message: errorMessage,
                table_id: tableId,
                language_used: language,
                language_warning: langValidation.warning || null
              },
              suggestions: [
                "Use scb_test_selection to validate your selection first",
                "Check variable names with scb_get_table_variables",
                "Verify region codes with scb_find_region_code"
              ]
            }, null, 2)
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // This will keep the process running
    process.stdin.resume();
  }
}

// Start the server when executed directly
const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFile) {
  const server = new SCBMCPServer();
  server.run().catch(console.error);
}