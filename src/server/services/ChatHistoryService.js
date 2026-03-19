import { snapshotSchema } from '../../schemas/snapshot.js';

export class ChatHistoryService {
    constructor() {
        this.chatTimeline = [];
        this.lastSnapshotHash = null;
        this.isStreaming = false;
        this.scrollInfo = null;
    }

    /**
     * Simple hash function for change detection
     */
    hashString(str) {
        if (!str) return '0';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(16);
    }

    /**
     * Process a raw snapshot from CDP, deduplicate messages, and update the timeline.
     * @param {Object} snapshot - The raw snapshot from manager.js
     * @returns {Object} - An object containing { hash, hasChanged, snapshotContainer }
     */
    processSnapshot(snapshot) {
        if (!snapshot || snapshot.error) {
            return { hasChanged: false, error: snapshot?.error || 'Invalid snapshot' };
        }

        const validation = snapshotSchema.safeParse(snapshot);
        if (!validation.success) {
            console.error('❌ [ZOD ERROR] DOM SCRAPING MISMATCH — sélecteurs probablement obsolètes :\\n', JSON.stringify(validation.error.format(), null, 2));
            return { hasChanged: false, error: 'Snapshot validation failed' };
        }

        const validSnapshot = validation.data;

        this.isStreaming = validSnapshot.isStreaming || false;
        this.scrollInfo = validSnapshot.scrollInfo || null;

        for (const msg of (validSnapshot.messages || [])) {
            if (msg.type === 'taskBlock') {
                if (!msg.taskSummary && (!msg.allStatuses || msg.allStatuses.length === 0)) continue;
                
                // Keep the block based on its TaskTitle or the start of its summary
                const k = msg.taskTitle || msg.taskSummary.substring(0, 50);
                const existingIdx = this.chatTimeline.findIndex(m => 
                    m.type === 'taskBlock' && 
                    (m.taskTitle === msg.taskTitle || m.taskSummary.substring(0, 50) === k)
                );
                
                if (existingIdx !== -1) {
                    // Overwrite entirely with the latest layout from CDP if the new one has a summary
                    if (msg.taskSummary && msg.taskSummary.length > 0) {
                        this.chatTimeline[existingIdx] = msg;
                    }
                } else {
                    this.chatTimeline.push({...msg}); 
                    console.log(`💾 Added step: [${msg.taskTitle || 'No Title'}]`);
                }
            } else {
                if (!msg.content || msg.content.length < 5) continue;
                const prefix = msg.content.substring(0, 50);
                const existingIdx = this.chatTimeline.findIndex(m => 
                    m.role === msg.role && m.type === msg.type && 
                    (m.content || '').substring(0, 50) === prefix
                );
                
                if (existingIdx !== -1) {
                    if (msg.content.length > this.chatTimeline[existingIdx].content.length) {
                        this.chatTimeline[existingIdx] = msg;
                    }
                } else {
                    this.chatTimeline.push(msg);
                    console.log(`💾 Added to timeline: ${msg.type} - ${prefix.substring(0, 30)}...`);
                }
            }
        }
        
        // Keep timeline manageable
        if (this.chatTimeline.length > 200) {
            this.chatTimeline = this.chatTimeline.slice(this.chatTimeline.length - 200);
        }

        const snapshotContainer = this.getSnapshot();
        const hash = this.hashString(JSON.stringify(snapshotContainer.messages) + (snapshotContainer.isStreaming ? '1' : '0'));
        
        const hasChanged = hash !== this.lastSnapshotHash;
        if (hasChanged) {
            this.lastSnapshotHash = hash;
        }

        return { hash, hasChanged, snapshot: snapshotContainer };
    }

    /**
     * Get the current snapshot state ready for the frontend
     */
    getSnapshot() {
        return {
            messages: [...this.chatTimeline],
            isFull: false,
            isStreaming: this.isStreaming,
            scrollInfo: this.scrollInfo
        };
    }

    // --- Simple Controller Accessors ---

    /**
     * Get the last taskBlock from the timeline
     */
    _getLastTaskBlock() {
        return [...this.chatTimeline].reverse().find(m => m.type === 'taskBlock') || null;
    }

    /**
     * Get the last task title (H3 heading)
     */
    getLastTitle() {
        return this._getLastTaskBlock()?.taskTitle || null;
    }

    /**
     * Get the last task paragraph (taskSummary — the dynamic comment that REPLACES itself)
     */
    getLastParagraph() {
        return this._getLastTaskBlock()?.taskSummary || null;
    }

    /**
     * Get the last task status (current step label)
     */
    getLastStatus() {
        return this._getLastTaskBlock()?.taskStatus || null;
    }

    /**
     * Get the accumulated subtitles/statuses (allStatuses)
     */
    getLastSubtitles() {
        return this._getLastTaskBlock()?.allStatuses || [];
    }

    /**
     * Get the last user message content
     */
    getLastUserMessage() {
        const msg = [...this.chatTimeline].reverse().find(m => m.role === 'user');
        return msg?.content || null;
    }

    /**
     * Get the last agent direct message content
     */
    getLastAgentMessage() {
        const msg = [...this.chatTimeline].reverse().find(m => m.type === 'directMessage');
        return msg?.content || null;
    }

    /**
     * HIGH-LEVEL CONTROLLER METHOD
     * Returns the complete current chat display state (text only).
     * Designed to be polled every second by the frontend.
     */
    getChatState() {
        const lastTask = this._getLastTaskBlock();
        const lastUser = [...this.chatTimeline].reverse().find(m => m.role === 'user');
        const lastAgent = [...this.chatTimeline].reverse().find(m => m.type === 'directMessage');
        
        return {
            // Current task context
            title: lastTask?.taskTitle || null,
            paragraph: lastTask?.taskSummary || null,
            status: lastTask?.taskStatus || null,
            subtitles: lastTask?.allStatuses || [],
            
            // Last messages
            lastUserMessage: lastUser?.content || null,
            lastAgentMessage: lastAgent?.content || null,
            
            // State flags
            isStreaming: this.isStreaming,
            messageCount: this.chatTimeline.length,
            
            // Full ordered message list (text only, no HTML)
            messages: this.chatTimeline.map(m => ({
                role: m.role || 'agent',
                type: m.type,
                content: m.content || m.taskSummary || null,
                title: m.taskTitle || null,
                subtitles: m.allStatuses || undefined
            }))
        };
    }
}

// Singleton export
export const chatHistoryService = new ChatHistoryService();
