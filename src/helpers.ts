import type { Session, StageContext, ExtractFields } from './index';

export function kickOffStage(context: StageContext): void {
    if (context.options.start) {
        context.options.start(context);
    }
    else if (context.options.say) {
        context.say(context.options.say);
    }
    else if (context.options.prompt) {
        context.reply(context.options.prompt);
    }
    else {
        // TODO: configure fallback option?
        throw Error('There is no way to respond to user');
    }
}
export async function handleResponse(session: Session, content: string) {
    if (!session.context) throw new Error('No Context')
    session.state.messages.push({ role: 'user', content: content });
    if (session.state.status === 'waiting') {
        session.state.status = 'working';

        if (!await extractFromResponse(session.context, content)) {
            session.context.retry();
        }
        else {
            // TODO: if context.options.assert
            triggerReaction(session.context);
        }
    }
}

/**
 * Extracts fields from a user response, returns false if required fields are missing
 * @param context
 * @param content
 */
export async function extractFromResponse(context: StageContext, content: string) {
    if (context.options.extract) {
        const fields = context.options.extract instanceof Function ? context.options.extract() : context.options.extract
        await context.extractFromString(content, fields);
        return verifyRequired(context, fields);
    }
    return true;
}

export function verifyRequired(context: StageContext, fields: ExtractFields) {
     if (context.options.require) {
         if (context.options.require instanceof Function) {
             return context.options.require(context);
         }
         const required = context.options.require instanceof Array ? context.options.require : Object.keys(fields);
         return required.every(field => !!context.session.state.data[field]);
     }
     return true;
 }

 export function triggerReaction(context: StageContext) {
     if (context.options.reaction) {
         if (typeof context.options.reaction === 'string') {
             context.next(context.options.reaction as string)
         }
         else {
             (context.options.reaction as Function)(context);
         }
     }
     else {
         context.session.state.status = 'ended';
     }
 }

/**
 * If the value exists in both objects, transform value into an array and contain both values
 * @param assigned
 * @param assigning
 */
export function assignWithTracking(assigned: any, assigning: any): Record<string, unknown> {
    const result = Object.assign({}, assigned);
    for (const key in assigning) {
        if (assigned.hasOwnProperty(key) && assigning.hasOwnProperty(key)) {
            const objValue = assigned[key];
            const srcValue = assigning[key];

            if (objValue && srcValue && objValue !== srcValue) {
                // if both objects, then go a level deeper
                if (objValue instanceof Object && srcValue instanceof Object) {
                    result[key] = assignWithTracking(objValue, srcValue);
                }
                else {
                    result[key] = {previous: objValue, current: srcValue};
                }
            }
            else {
                result[key] = srcValue || objValue;
            }
        }
        else if (!assigned.hasOwnProperty(key) && assigning.hasOwnProperty(key)) {
            result[key] = assigning[key];
        }
    }
    return result;
}



