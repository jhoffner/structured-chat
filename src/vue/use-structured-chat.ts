import { reactive, ref } from "vue";
import { handleResponse } from "../helpers";
import {
    type Definition,
    type Session,
    setStageContext,
    type Suggestion,
    type Message
} from "../index";

export const useStructuredChat = (definition: Definition, initialData?: Record<string, unknown>) => {
    const status = ref('loading');
    const stage = ref(null);
    const loadingMessage = ref('Thinking');
    const data = ref(initialData || {});
    const waits = ref([]);
    const messages = ref([]);
    const improving = ref(false);
    const extracting = ref(false);

    const session: Session = {
        definition,
        context: null,
        // convert to a reactive object so that our service code doesn't need to think about .value references
        state: reactive({
            status,
            loadingMessage,
            stage,
            data,
            waits,
            messages,
            improving,
            extracting,
        }),
    }

    setStageContext(session, definition.stages[0]);

    return {
        respond: (content: string) => handleResponse(session, content),
        onSuggestion: (suggestion: Suggestion, message: Message) => {
            // NOTE: this is error prone because the context could have changed. UI should disable stale suggestions to prevent this.
            if (session.context?.options?.onSuggestion) {
                session.context.options.onSuggestion(session.context, suggestion, message);
            }
        },
        status,
        loadingMessage,
        stage,
        data,
        waits,
        messages,
        improving,
        extracting,
        session,
    };
}