#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { SCBMCPServer } from './index.js';
import { prompts, getPromptById, generatePromptMessages } from './prompts.js';
import { resources, getResourceContent } from './resources.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
}));
app.use(express.json());
// Handle JSON parse errors (transport-level error)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            jsonrpc: '2.0',
            id: null,
            error: {
                code: -32700,
                message: 'Parse error: Invalid JSON',
            },
        });
    }
    next();
});
// Create MCP server instance
const server = new Server({
    name: 'SCB Statistics Server',
    version: '2.4.2',
}, {
    capabilities: {
        tools: {},
        prompts: {},
        resources: {},
    },
});
const mcpServer = new SCBMCPServer();
// Setup tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: mcpServer.getTools(),
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await mcpServer.callTool(name, args);
});
// Setup prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts,
    };
});
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = getPromptById(name);
    if (!prompt) {
        throw new Error(`Prompt not found: ${name}`);
    }
    return {
        messages: generatePromptMessages(name, args || {}),
    };
});
// HTTP endpoints
// OPTIONS handler for CORS preflight
app.options('/mcp', (req, res) => {
    res.status(204).end();
});
// GET /mcp - Server information endpoint
app.get('/mcp', (req, res) => {
    res.json({
        protocol: 'mcp',
        version: '2.4.2',
        name: 'SCB Statistics Server',
        description: 'Swedish statistics data via MCP protocol',
        authentication: 'none',
        transport: 'http',
        capabilities: {
            tools: true,
            resources: true,
            prompts: true,
        },
        tools: mcpServer.getTools().length,
        resources: resources.length,
        prompts: prompts.length,
        connection: {
            method: 'POST',
            endpoint: '/mcp',
            content_type: 'application/json',
            format: 'MCP JSON-RPC 2.0',
        },
        compatibility: {
            platforms: ['web', 'desktop', 'cli'],
            clients: ['Claude Code', 'Claude Desktop', 'ChatGPT', 'Gemini', 'Custom MCP clients'],
        },
    });
});
// Main MCP endpoint - handles JSON-RPC requests
app.post('/mcp', async (req, res) => {
    try {
        const { jsonrpc, id, method, params } = req.body;
        // JSON-RPC 2.0 spec: All valid JSON-RPC responses use HTTP 200
        // Only transport-level errors (invalid JSON) should use HTTP 400
        // Validate JSON-RPC version
        if (jsonrpc !== '2.0') {
            return res.status(200).json({
                jsonrpc: '2.0',
                id: id || null,
                error: {
                    code: -32600,
                    message: 'Invalid Request: jsonrpc must be "2.0"',
                },
            });
        }
        // Handle initialize method
        if (method === 'initialize') {
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                        prompts: {},
                    },
                    serverInfo: {
                        name: 'SCB Statistics Server',
                        version: '2.4.2',
                    },
                },
            });
        }
        // Handle initialized notification (no response per JSON-RPC spec)
        if (method === 'notifications/initialized') {
            // Notifications don't require a response, just acknowledge
            return res.status(204).end();
        }
        // Handle tools/list
        if (method === 'tools/list') {
            const tools = mcpServer.getTools();
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                    tools,
                },
            });
        }
        // Handle tools/call
        if (method === 'tools/call') {
            const { name, arguments: args } = params;
            const result = await mcpServer.callTool(name, args);
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result,
            });
        }
        // Handle prompts/list
        if (method === 'prompts/list') {
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                    prompts,
                },
            });
        }
        // Handle prompts/get
        if (method === 'prompts/get') {
            const { name, arguments: args } = params;
            const prompt = getPromptById(name);
            if (!prompt) {
                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32602,
                        message: `Prompt not found: ${name}`,
                    },
                });
            }
            const messages = generatePromptMessages(name, args || {});
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                    messages,
                },
            });
        }
        // Handle resources/list
        if (method === 'resources/list') {
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                    resources,
                },
            });
        }
        // Handle resources/read
        if (method === 'resources/read') {
            const { uri } = params;
            const content = getResourceContent(uri);
            if (!content) {
                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32602,
                        message: `Resource not found: ${uri}`,
                    },
                });
            }
            return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                    contents: [
                        {
                            uri,
                            mimeType: content.mimeType,
                            text: content.content,
                        },
                    ],
                },
            });
        }
        // Method not found (HTTP 200 per JSON-RPC 2.0 spec)
        return res.status(200).json({
            jsonrpc: '2.0',
            id,
            error: {
                code: -32601,
                message: `Method not found: ${method}`,
            },
        });
    }
    catch (error) {
        console.error('Error handling request:', error);
        // JSON-RPC errors use HTTP 200 (application-level error)
        return res.status(200).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
                code: -32603,
                message: error instanceof Error ? error.message : 'Internal error',
            },
        });
    }
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Root endpoint - display README as HTML
app.get('/', (req, res) => {
    try {
        // Read README.md from project root
        const readmePath = path.join(__dirname, '..', 'README.md');
        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        // Convert markdown to HTML
        const htmlContent = marked.parse(readmeContent);
        // Send HTML response with styling
        res.send(`
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SCB MCP Server - Documentation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #24292e;
      background: #f6f8fa;
      padding: 20px;
    }

    .container {
      max-width: 980px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
    }

    h1 {
      font-size: 2em;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
      margin-bottom: 16px;
    }

    h2 {
      font-size: 1.5em;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
      margin-top: 24px;
      margin-bottom: 16px;
    }

    h3 {
      font-size: 1.25em;
      margin-top: 24px;
      margin-bottom: 16px;
    }

    p {
      margin-bottom: 16px;
    }

    a {
      color: #0366d6;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace;
      font-size: 85%;
    }

    pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin-bottom: 16px;
    }

    pre code {
      background: none;
      padding: 0;
      font-size: 100%;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }

    table th,
    table td {
      padding: 6px 13px;
      border: 1px solid #dfe2e5;
    }

    table th {
      background: #f6f8fa;
      font-weight: 600;
    }

    table tr:nth-child(2n) {
      background: #f6f8fa;
    }

    ul, ol {
      margin-bottom: 16px;
      padding-left: 2em;
    }

    li {
      margin-bottom: 4px;
    }

    blockquote {
      padding: 0 1em;
      color: #6a737d;
      border-left: 4px solid #dfe2e5;
      margin-bottom: 16px;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      background: #0366d6;
      color: white;
      border-radius: 3px;
      font-size: 12px;
      margin-right: 8px;
      margin-bottom: 16px;
    }

    .header-links {
      margin-bottom: 24px;
      padding: 12px;
      background: #f1f8ff;
      border: 1px solid #c8e1ff;
      border-radius: 6px;
    }

    @media (max-width: 768px) {
      .container {
        padding: 20px;
      }

      body {
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-links">
      <span class="badge">v2.4.2</span>
      <a href="/mcp">API Endpoint</a> |
      <a href="/health">Health Check</a> |
      <a href="https://github.com/KSAklfszf921/scb-mcp-http">GitHub</a>
    </div>
    ${htmlContent}
  </div>
</body>
</html>
    `);
    }
    catch (error) {
        res.status(500).send(`
<!DOCTYPE html>
<html>
<head>
  <title>Error</title>
</head>
<body>
  <h1>Error loading documentation</h1>
  <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
</body>
</html>
    `);
    }
});
// Start server
app.listen(PORT, () => {
    console.log(`SCB MCP HTTP Server running on port ${PORT}`);
    console.log(`Info endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
//# sourceMappingURL=http-server.js.map