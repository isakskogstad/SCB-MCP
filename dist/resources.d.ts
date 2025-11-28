import { Resource } from '@modelcontextprotocol/sdk/types.js';
export declare const commonRegions: {
    code: string;
    name: string;
    type: string;
}[];
export declare const popularTables: {
    id: string;
    name: string;
    category: string;
    description: string;
}[];
export declare const categories: {
    id: string;
    name_sv: string;
    name_en: string;
    keywords: string[];
}[];
export declare const resources: Resource[];
export declare function getResourceContent(uri: string): {
    content: string;
    mimeType: string;
} | null;
//# sourceMappingURL=resources.d.ts.map