#!/usr/bin/env node
import { Tool } from '@modelcontextprotocol/sdk/types.js';
export declare class SCBMCPServer {
    private server;
    private apiClient;
    constructor();
    private setupToolHandlers;
    getTools(): Tool[];
    callTool(name: string, args: any): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    private handleGetApiStatus;
    private handleSearchTables;
    private handleGetTableInfo;
    private handleGetTableData;
    private handleCheckUsage;
    private handleSearchRegions;
    private handleGetTableVariables;
    private handleFindRegionCode;
    private handleTestSelection;
    private handlePreviewData;
    run(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map