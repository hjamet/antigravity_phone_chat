export const SELECTORS = {
    workbench: {
        managerButton: '#workbench\\.parts\\.titlebar > div > div.titlebar-right > div.action-toolbar-container > a'
    },
    sidebar: {
        openWorkspaceButton: '[aria-label="Open Workspace"]',
        workspaceListItems: '.text-quickinput-foreground', // Les `div` cliquables des projets
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
        sectionLabelProgress: '.flex.items-center.justify-between',    // Progress Updates header row
        progressScrollable: '.overflow-y-auto.overflow-x-hidden',
        statusHeader: '.sticky.top-0 .flex.items-center.gap-2.font-medium', // TaskStatus container (pb varies)
        statusText: '.leading-relaxed'                                 // TaskStatus text inside header
    },

    // ---- Control elements (input area below chat) ----
    controls: {
        inputBox: '#antigravity\\.agentSidePanelInputBox',
        editor: '[contenteditable="true"][role="textbox"]',
        controlsRow: '.mt-1.flex.w-full.items-center.justify-between',           // Row holding mode/model buttons
        modeButton: 'button.py-1.pl-1.pr-2.flex.items-center',                   // Mode toggle (Fast/Planning)
        modelClickable: '.flex.min-w-0.max-w-full.cursor-pointer.items-center',   // Model name clickable div
        modelLabel: 'span.select-none.overflow-hidden.text-ellipsis.text-xs',     // Model name text span
        cancelButton: '[data-tooltip-id="input-send-button-cancel-tooltip"]',     // Cancel active generation
        submitButton: '[data-tooltip-id^="input-send-button"]:not([data-tooltip-id*="cancel"])', // Submit (send or pending), NOT cancel
        audioButton: '[data-tooltip-id="audio-tooltip"]',                         // Mic button
        retryButton: '#antigravity\\.agentSidePanelInputBox footer button.bg-ide-button-background', // Retry button when agent fails
        errorMessage: '.text-sm.font-medium'                                     // "Agent terminated due to error"
    },

    // ---- Dropdowns / popover dialogs (mode & model pickers) ----
    dropdowns: {
        dialog: '[role="dialog"]',                                                // Popover container (mode or model)
        modeOption: '.font-medium',                                               // Mode option label (Fast/Planning)
        modelOptionRow: '.px-2.py-1.flex.items-center',                           // Model option row
        modelOptionName: 'span.text-xs.font-medium',                              // Model name in dropdown
    },

    // ---- Sidebar navigation buttons ----
    sidebarNav: {
        navButton: 'div[role="button"]',                                          // Generic nav button in sidebar
        googleSymbol: '.google-symbols',                                          // Icon inside nav buttons
        newChatIcon: 'add',                                                       // google-symbols text for new chat
        historyIcon: 'history',                                                   // google-symbols text for history
        editButton: 'button[title="Edit"]',                                       // New chat alt (edit icon)
    },

    // ---- Chat history sidebar ----
    history: {
        conversationPill: '[data-testid^="convo-pill-"]',                         // Conversation entry pill
        timeLabel: 'span.text-xs',                                                // Relative time label
        sectionContainer: '.flex.flex-col.gap-px',                                // Section grouping conversations
        sectionHeader: 'span.text-sm.font-medium.flex-shrink-0.truncate',         // Workspace name header
        activeSpinner: '.google-symbols',                                         // Active spinner icon container
    },

    // ---- State reading (mode/model/workspace) ----
    state: {
        modeLabel: 'span.text-xs.select-none',                                   // Mode text inside mode button
        workspaceHeader: 'span.text-sm.font-medium.flex-shrink-0.truncate',       // Workspace section name
    },

    // ---- Picker popups (/ and @ triggers) ----
    picker: {
        dialog: 'div[role="dialog"][style*="visibility: visible"]',               // Visible picker popup
        options: 'div[role="dialog"][style*="visibility: visible"] .flex.items-center.justify-start.gap-2', // Clickable option rows
        typeaheadList: 'div[role="listbox"][aria-label="Typeahead menu"]',         // Secondary typeahead list
        typeaheadItem: 'div[role="listbox"][aria-label="Typeahead menu"] > div',   // Individual typeahead option
        workflowList: '.absolute.-top-2.-translate-y-full.bg-ide-editor-background', // Workflow list overlay
    },

    // ---- Artifacts / Changes Panel ----
    artifacts: {
        toggleSidebar: '[data-testid="toggle-aux-sidebar"]',                      // Button to open/close the aux sidebar
        sidebarPanel: '.bg-sideBar-background',                                   // Aux sidebar container
        sectionHeader: '.text-xs.opacity-50',                                     // Section header ("Artifacts", "Files Changed")
        artifactSectionParent: '.flex.flex-col.w-full',                           // Parent of the Artifacts section
        viewerPanel: '.flex.w-full.h-full.outline-none.flex-col',                 // Artifact viewer panel (2 children: header + content)
        viewerHeader: '.border-gray-500\\/20.flex.border-b-\\[1px\\]',            // Viewer header bar (h=40)
        viewerContent: '.leading-relaxed.select-text',                            // Rendered markdown content div
        viewerScroll: '.jetski-scrollable-element',                               // Scrollable container for viewer
        markdownParagraph: 'p.animate-markdown',                                  // Individual markdown paragraph
        markdownAlert: '.markdown-alert',                                         // Alert boxes in markdown
        backButton: '[data-tooltip-id$="-back"]',                                 // Back navigation button
        forwardButton: '[data-tooltip-id$="-forward"]',                           // Forward navigation button
        reviewButton: 'button[aria-haspopup="dialog"]',                           // "Review" button (opens comment dialog)
        commentEditor: '[contenteditable="true"][class*="bg-gray-500"]',          // Comment text editor
    },
};
