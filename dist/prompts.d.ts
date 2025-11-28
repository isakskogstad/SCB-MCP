import { Prompt } from '@modelcontextprotocol/sdk/types.js';
export declare const prompts: Prompt[];
export declare function getPromptById(name: string): Prompt | undefined;
export declare function generatePromptMessages(promptName: string, args: Record<string, string>): Array<{
    role: string;
    content: {
        type: string;
        text: string;
    };
}>;
//# sourceMappingURL=prompts.d.ts.map