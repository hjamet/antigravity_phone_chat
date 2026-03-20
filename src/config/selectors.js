export const SELECTORS = {
    workbench: {
        managerButton: '#workbench\\.parts\\.titlebar > div > div.titlebar-right > div.action-toolbar-container > a'
    },
    sidebar: {
        openWorkspaceButton: '[aria-label="Open Workspace"]',
        workspaceListItems: '.text-quickinput-foreground', // Les \`div\` cliquables des projets
        workspaceItemName: 'span.text-sm.truncate',        // Le span contenant le nom du projet
        workspaceItemPath: 'span.text-xs.opacity-50'       // Le span contenant le chemin local/remote
    },
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
    },
    agentTask: {
        taskBlockWithUI: '.isolate.mb-2',
        thoughtBlock: '.isolate:not(.mb-2)',
        title: 'span.font-semibold.text-ide-text-color',              // TaskName
        summaryContent: '.leading-relaxed.select-text',                // TaskSummary
        sectionBorderT: '.border-t.p-2.text-sm',
        sectionLabelNoise: '.mb-1.text-sm.opacity-50',                 // Files Edited / BG Steps
        progressScrollable: '.overflow-y-auto.overflow-x-hidden',
        statusHeader: '.sticky.top-0 .flex.items-center.gap-2.font-medium.pb-2', // TaskStatus container
        statusText: '.leading-relaxed'                                 // TaskStatus text inside header
    }
};
