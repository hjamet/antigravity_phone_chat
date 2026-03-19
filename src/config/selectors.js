export const SELECTORS = {
    chat: {
        scrollContainer: '[class*="scrollbar-hide"][class*="overflow-y"]',
        turnsContainer: '[class*="flex"][class*="flex-col"][class*="gap-y"]',
        streamingIndicator: '[class*="progress_activity"],[class*="animate-spin"],[class*="animate-pulse"]'
    },
    user: {
        messageBlock: '[class*="bg-gray-500"][class*="select-text"]'
    },
    agent: {
        taskBlock: '.isolate',
        directMessage: '.select-text.leading-relaxed'
    }
};
