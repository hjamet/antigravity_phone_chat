import { snapshotSchema } from '../../schemas/snapshot.js';

export class ChatHistoryService {
    constructor() {
        this.chatTimeline = [];
        this.lastSnapshotHash = null;
        this.isStreaming = false;
        this.scrollInfo = null;
        this.ignoreUntil = 0;
        this.availableArtifacts = [];
    }

    /**
     * Reset the timeline for a new conversation.
     * Called when the user starts a new chat or switches projects.
     */
    reset() {
        // Save the signature of the current conversation to detect stale DOM
        // during the native UI transition.
        if (this.chatTimeline.length > 0) {
            const first = this.chatTimeline[0]?.content || '';
            const last = this.chatTimeline[this.chatTimeline.length - 1]?.content || '';
            this.staleSignature = this.hashString(first + last);
            this.staleLockExpiry = Date.now() + 5000; // max lock 5s
        } else {
            this.staleSignature = null;
        }

        this.chatTimeline = [];
        this.lastSnapshotHash = null;
        this.isStreaming = false;
        this.scrollInfo = null;
        this.ignoreUntil = 0; // Legacy
        console.log(`🔄 ChatHistoryService reset — waiting for UI transition`);
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

        // --- STALE DOM DETECTION ---
        // During a chat transition, the scraper might capture the old, disappearing UI.
        // We reject incoming snapshots whose signature matches the one we just discarded,
        // until a strictly different snapshot arrives (or a 5s max timeout is reached).
        if (this.staleSignature) {
            if (Date.now() > this.staleLockExpiry) {
                console.log('⚠️ Stale UI lock expired (5s). Forcing accept of current DOM.');
                this.staleSignature = null;
            } else {
                const msgs = snapshot.messages || [];
                if (msgs.length > 0) {
                    const first = msgs[0]?.content || '';
                    const last = msgs[msgs.length - 1]?.content || '';
                    const currentSig = this.hashString(first + last);
                    
                    if (currentSig === this.staleSignature) {
                        return { hasChanged: false, ignored: true };
                    }
                }
                // Signature changed (or empty chat). The transition is complete!
                this.staleSignature = null;
                console.log('✅ UI Transition complete. Resuming snapshot processing.');
            }
        }


        const validation = snapshotSchema.safeParse(snapshot);
        if (!validation.success) {
            console.error('❌ [ZOD ERROR] DOM SCRAPING MISMATCH — sélecteurs probablement obsolètes :\\n', JSON.stringify(validation.error.format(), null, 2));
            return { hasChanged: false, error: 'Snapshot validation failed' };
        }

        const validSnapshot = validation.data;

        this.isStreaming = validSnapshot.isStreaming || false;
        this.scrollInfo = validSnapshot.scrollInfo || null;
        if (validSnapshot.availableArtifacts && validSnapshot.availableArtifacts.length > 0) {
            this.availableArtifacts = validSnapshot.availableArtifacts;
        }

        for (const msg of (validSnapshot.messages || [])) {
            if (msg.type === 'taskBlock') {
                if (!msg.taskSummary && (!msg.allStatuses || msg.allStatuses.length === 0)) continue;
                
                // We must handle deduplication correctly when multiple taskBlocks are captured at once.
                let existingIdx = -1;
                
                // 1. Try to find by exact title (if it's a finished, named task)
                if (msg.taskTitle && msg.taskTitle !== 'Action en cours') {
                    existingIdx = this.chatTimeline.findIndex(m => m.type === 'taskBlock' && m.taskTitle === msg.taskTitle);
                }
                
                // 2. If not found, try to find by summary prefix
                if (existingIdx === -1 && msg.taskSummary) {
                    const prefix = msg.taskSummary.substring(0, 50);
                    existingIdx = this.chatTimeline.findIndex(m => m.type === 'taskBlock' && m.taskSummary && m.taskSummary.substring(0, 50) === prefix);
                }
                
                // 3. Fallback: if the incoming msg is the current task, it should overwrite the LAST taskBlock 
                // ONLY IF the last taskBlock is still unnamed ("Action en cours").
                if (existingIdx === -1) {
                    let lastIdx = -1;
                    for (let i = this.chatTimeline.length - 1; i >= 0; i--) {
                        if (this.chatTimeline[i].type === 'taskBlock') {
                            lastIdx = i;
                            break;
                        }
                    }
                    if (lastIdx !== -1 && this.chatTimeline[lastIdx].taskTitle === 'Action en cours') {
                        existingIdx = lastIdx;
                    }
                }
                
                if (existingIdx !== -1) {
                    // Update existing block
                    const existingBlock = this.chatTimeline[existingIdx];
                    
                    // CRITICAL: Never let 'Thought for' blocks overwrite the real task paragraph!
                    const isThought = msg.taskTitle && msg.taskTitle.includes('Thought for');

                    // Update taskTitle if present and not a 'Thought for' block
                    if (msg.taskTitle && msg.taskTitle !== 'Action en cours' && !isThought) {
                        existingBlock.taskTitle = msg.taskTitle;
                    }
                    // Update taskStatus if present
                    if (msg.taskStatus) {
                        existingBlock.taskStatus = msg.taskStatus;
                    }
                    
                    // Only apply taskSummary/html if it's not a 'Thought for' block
                    if (!isThought) {
                        if (msg.taskSummary) existingBlock.taskSummary = msg.taskSummary;
                        if (msg.html) existingBlock.html = msg.html;
                    }

                    // Update allStatuses by merging, ensuring uniqueness and order
                    if (msg.allStatuses && msg.allStatuses.length > 0) {
                        const newStatuses = new Set(existingBlock.allStatuses);
                        msg.allStatuses.forEach(status => newStatuses.add(status));
                        existingBlock.allStatuses = Array.from(newStatuses);
                    }

                } else {
                    // Add new block
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
            
            // Full ordered message list
            messages: this.chatTimeline.map(m => ({
                role: m.role || 'agent',
                type: m.type,
                content: m.content || m.taskSummary || null,
                html: m.html || m.taskSummaryHtml || null,
                title: m.taskTitle || null,
                status: m.taskStatus || null,
                allStatuses: ChatHistoryService._filterCleanStatuses(m.allStatuses || [])
            })),

            // Available artifacts from sidebar
            availableArtifacts: this.availableArtifacts || []
        };
    }

    /**
     * Filter allStatuses to only keep real TaskStatus lines.
     * Real TaskStatus values are set by task_boundary calls and follow a strict pattern:
     *   - Start with an -ing gerund verb ("Analyzing...", "Restarting...", "Updating...")
     *   - Are 20-150 chars long, clean declarative phrases
     *   - Never contain code, punctuation runs, JSON, paths, or conversational text
     */
    static _filterCleanStatuses(statuses) {
        return statuses.filter(s => {
            if (!s || s.length < 15 || s.length > 200) return false;
            
            // Reject structural patterns like terminal colors, JSON braces
            if (/[{}[\]`\\]/.test(s)) return false;
            
            // Reject lines with generic terminal outputs
            if (s.startsWith('Running command') || s.startsWith('Exit code')) return false;
            
            // Reject conversational text (reasoning, questions, explanations)
            if (/^(Now |But |Also |The |I |This |Still |However |Wait|Looking|Found |Error |Sent )/i.test(s)) return false;
            if (/^(Let me|I need|I can|I see|That means|Need to)+/i.test(s)) return false;
            
            // Must have at least 4 words (real statuses are descriptive phrases)
            if (s.split(' ').length < 4) return false;
            
            // Reject if it ends with common noise patterns
            if (/\.\.\.$/.test(s)) return false;
            
            return true;
        });
    }
}

// Singleton export
export const chatHistoryService = new ChatHistoryService();
