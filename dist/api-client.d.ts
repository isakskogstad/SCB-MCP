import { ConfigResponse, FolderResponse, TablesResponse, Dataset, RateLimitInfo } from './types.js';
export declare class SCBApiClient {
    private baseUrl;
    private rateLimitInfo;
    private requestCount;
    private windowStartTime;
    constructor(baseUrl?: string);
    private initializeRateLimit;
    private checkRateLimit;
    private makeRequest;
    getConfig(): Promise<ConfigResponse>;
    getNavigation(folderId?: string, lang?: string): Promise<FolderResponse>;
    searchTables(params?: {
        query?: string;
        pastDays?: number;
        includeDiscontinued?: boolean;
        pageNumber?: number;
        pageSize?: number;
        lang?: string;
    }): Promise<TablesResponse>;
    getTableMetadata(tableId: string, lang?: string): Promise<Dataset>;
    private translateCommonVariables;
    private translateCommonValues;
    validateSelection(tableId: string, selection: Record<string, string[]>, lang?: string): Promise<{
        isValid: boolean;
        errors: string[];
        suggestions: string[];
        translatedSelection?: Record<string, string[]>;
    }>;
    getTableData(tableId: string, selection?: Record<string, string[]>, lang?: string): Promise<Dataset>;
    /**
     * Transform JSON-stat2 data into structured records for easy analysis
     */
    transformToStructuredData(jsonStat2Data: Dataset, selection?: Record<string, string[]>): {
        query: any;
        data: Array<Record<string, any>>;
        metadata: any;
        summary: any;
    };
    /**
     * Convert dimension names to user-friendly base names
     */
    getDimensionBaseName(dimName: string): string;
    getRateLimitInfo(): RateLimitInfo | null;
    getUsageInfo(): {
        requestCount: number;
        windowStart: Date;
        rateLimitInfo: RateLimitInfo | null;
    };
    /**
     * Search for regions by name (fuzzy search)
     * Returns regions from multiple common tables that might contain the search term
     */
    searchRegions(query: string, lang?: string): Promise<Array<{
        code: string;
        name: string;
        type: string;
    }>>;
    /**
     * Find exact region code(s) for a municipality or county name
     */
    findRegionCode(query: string, tableId?: string, lang?: string): Promise<{
        exact_matches: Array<{
            code: string;
            name: string;
            type: string;
            table: string;
        }>;
        suggestions: string[];
    }>;
}
//# sourceMappingURL=api-client.d.ts.map