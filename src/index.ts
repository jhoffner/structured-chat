import { extract, improve, reply } from "@/services/llm";
import { kickOffStage, assignWithTracking } from "./helpers";

interface FallbackOptions {
    reaction: Function;
}

export type ContextCallback = (context: StageContext) => void;
export type SuggestionCallback = (context: StageContext, suggestion: Suggestion, message: Message) => void;

interface StageOverridableOptions {
    replyContext?: String;
    say?: string;
    prompt?: string;
    onSuggestion?: SuggestionCallback;
    extract?: ContextCallback|ExtractFields;
    require?: ContextCallback|boolean|Array<string>;
    assert?: Record<string, string|Function|boolean>|string;
}

interface StageOptions extends StageOverridableOptions {
    name: String;
    helpers?: Record<string, Function>;
    description: String;
    start?: ContextCallback;
    /**
     * Either a function to handle the react to a user's message, or a string indicating the next stage to move to.
     * This method will be skipped, and retry will be called instead of required criteria are not met.
     */
    reaction?: ContextCallback|string;
    /**
     * Either a function method to handle retry logic, or a string which will be a set of instructions
     * passed into the reply method
     */
    retry: ContextCallback|string;
}

export interface Definition {
    name: string;
    description?: string;
    fallback?: FallbackOptions;
    stages: StageOptions[];
    replyContext?: String;
}
/**
 * Defines the expanded message format that is sent by the assistant to the user.
 */
export interface Message {
    id?: string;
    role: string;
    content: string;
    suggestions?: Suggestion[]
    fields?: RequestField[]
    actions?: RequestAction[]
    /**
     * If true, and the last message in the list, then it will block the user from typing anything
     */
    blocking?: boolean;
}

export interface RequestAction {
    label: string;
    icon?: string;
    handler: Function;
}

interface RequestFieldOption {
    value: string;
    label?: string;
    tip?: string;
    disabled?: boolean;
}

export interface RequestField {
    key: string;
    label?: string;
    description?: string;
    value: string;
    type: 'text'|'textarea'|'number'|'email'|'url'|'date'|'select'|'multiselect'|'checkbox'|'radio'|'file'|'image'|'video'|'audio'|'password';
    options?: RequestFieldOption[];
    handler?: Function;
}

export interface Suggestion {
    value: string;
    label: string;
    description?: string;
    icon?: string;
    selected?: boolean;
    disabled?: boolean;
}

export type ExtractFields = Record<string, string|Record<string, string>>

export interface SayOptions {
    changeStatus?: boolean;
    suggestions?: Suggestion[];
    fields?: RequestField[];
    blocking?: boolean;
    dataKey?: string;
}

interface ReplyOptions extends SayOptions {
    maxHistory?: number;
}

interface ReactiveState {
    status: string|'waiting'|'working'|'ended';
    loadingMessage: string;
    data: Record<string, unknown>;
    waits: any[];
    messages: Message[];
    improving: boolean;
    extracting: boolean;
}

export interface Session {
    readonly definition: Definition;
    context?: StageContext|null;
    previousContext?: StageContext|null;
    state: ReactiveState;
}

// TODO: add verify which asks the user to verify the inputs look good to them.

export interface StageContext {
    previousData?: Record<string, unknown>;
    data: Record<string, unknown>;
    readonly helpers: Record<string, Function>;
    userText?: string; // how do we handle a user wanted to say more after they pressed send?
    promptText?: string; // what the assistant said when a prompt command was used
    readonly options: StageOptions;
    session: Session;
    say(msg: string, options?: SayOptions): void;
    reply(instructions: string, options?: ReplyOptions): Promise<string>;
    retry(): void;
    /**
     * How many times the stage has looped back to itself, if any. Zero if retry has not previously been called.
     */
    retries: number;
    appendMessage(role: string, content: string): void;
    acceptSuggestion(suggestion: Suggestion, dataKey?: string): void;
    clearSuggestions(): void;
    disableSuggestions(): void;
    extractFromUrl(url: string, fields: ExtractFields):Promise<Record<string, unknown>>;
    extractFromString(url: string, fields: ExtractFields):Promise<Record<string, unknown>>;
    improve(fields: Record<string, unknown>, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    delayedNext(stageName: string, overrides?: StageOverridableOptions): void;
    next(stageName: string, overrides?: StageOverridableOptions): void;
    end(msg: string):void;
}

export function setStageContext (session: Session, options: StageOptions): StageContext {
    session.previousContext = session.context;
    const verifyCurrentContext = (callback: Function) => {
        if (session.context !== context) {
            throw new Error('Context has changed');
        }
        return callback();
    }
    
    const state = session.state;

    const context: StageContext = {
        data: session.state.data,
        helpers: options.helpers || {},
        options,
        session,
        retries: 0,
        appendMessage: (role, content) => {
            state.messages.push({ role, content });
        },
        say: (
            msg: string,
            {
                changeStatus = true,
                suggestions,
                fields,
                // dataKey,
                blocking
            }: SayOptions = {}
        ) => {
            state.messages.push({
                role: 'assistant',
                content: msg,
                suggestions,
                blocking,
                fields,
                // dataKey
            });
            if (changeStatus) {
                state.status = 'waiting';
            }
        },
        reply: async (
            instructions: string,
            { maxHistory = 5, changeStatus = true, ...options }: ReplyOptions = {}
        ) => {
            context.session.state.loadingMessage = 'Responding';
            const replyContext = context.options.replyContext || context.session.definition.replyContext;
            const messages = maxHistory ? state.messages.slice(-maxHistory) : state.messages;
            const content = await reply(null, messages, instructions, replyContext as string);

            context.say(content, { changeStatus, ...options });
            return content;
        },
        retry: () => {
            if (typeof context.options.retry  === 'string') {
                context.reply(context.options.retry as string)
            }
            else {
                (context.options.retry as Function)(context);
            }
            context.retries++;
        },
        acceptSuggestion: (suggestion: Suggestion, dataKey?: string) => {
            if (dataKey) {
                state.data[dataKey] = suggestion.value;
            }
            context.appendMessage('user', suggestion.label || suggestion.value);
        },
        clearSuggestions: () => {
            state.messages.forEach(m => {
                if (m.suggestions) {
                    m.suggestions = [];
                }
            });
        },
        disableSuggestions: () => {
            state.messages.forEach(m => {
                m.suggestions?.forEach(s => s.disabled = true);
            });
        },
        extractFromUrl: async (url: string, fields: ExtractFields) => {
            return {};
        },
        extractFromString: async (input: string, fields: ExtractFields) => {
            state.loadingMessage = 'Thinking';
            state.extracting = true;
            try {
                // if (Object.keys(state.data).length > 0) {
                //     fields._previousStage = 'True if the user is trying to adjust their response to a previously asked question that is not the most recent question';
                // }
                const extracted = await extract(input, fields, state.messages);
                assignWithTracking(state.data, extracted);
                return extracted;
            } finally {
                state.extracting = false;
            }
        },
        improve: async (fields: Record<string, string>, data: Record<string, unknown> = state.data) => {
            state.improving = true;
            try {
                const improvements = await improve(data, fields, state.messages);
                assignWithTracking(state.data, improvements);
                return improvements;
            }finally {
                state.improving = false;
            }
        },
        /**
         * Calls next but with a delay, useful for when you know that the next stage will quickly say something, and you
         * want the conversation response time to feel more natural.
         * @param stageName
         * @param overrides
         */
        delayedNext: (stageName: string, overrides?: StageOverridableOptions) => {
            state.loadingMessage = 'Responding';
            state.status = 'working';
            setTimeout(() => context.next(stageName, overrides), 1250);
        },
        next: (stageName: string, overrides?: StageOverridableOptions) => {
            state.status = 'working';
            // context.disableSuggestions(); // for now we always disable previous suggestions when moving to the next stage
            return verifyCurrentContext(() => {
                const nextStage = session.definition.stages.find(s => s.name === stageName);
                if (!nextStage) {
                    throw new Error(`Could not find stage ${stageName}`);
                }
                
                setStageContext(session, overrides ? { ...nextStage, ...overrides } : nextStage);
            });
        },
        end: (msg: string) => {
            return verifyCurrentContext(() => {
                if (msg) {
                    context.appendMessage('assistant', msg);
                }
                state.status = 'ended';
            });
        }
    };

    session.context = context;
    session.state.stage = context.options.name;
    kickOffStage(context);
    return context;
}